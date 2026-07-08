import "server-only";

import { db } from "@emach/db";
import {
	type OrderPicking,
	type OrderPickingItem,
	type OrderPickingStatus,
	type OrderStatus,
	order,
	orderPicking,
	orderPickingItem,
} from "@emach/db/schema/orders";
import { toDate } from "@emach/db/utils";
import { eq, sql } from "drizzle-orm";
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";

export interface PickingQueueRow {
	branchId: string | null;
	branchName: string | null;
	clientName: string;
	// Present only for "excecoes" tab
	exceptionReason?: string | null;
	itemCount: number;
	// Present only for "em_separacao" tab
	lastScannedAt?: Date | null;
	number: string;
	orderId: string;
	orderStatus: OrderStatus;
	paidAt: Date | null;
	pickedUnits?: number;
	pickerName?: string;
	// Present only for "em_separacao" and "excecoes" tabs
	pickingId?: string;
	// Present only for "em_separacao" tab
	pickingStartedAt?: Date | null;
	unitCount: number;
}

/**
 * Retorna branchId + status do pedido (para validação de escopo e para decidir
 * se o painel pós-separação ainda faz sentido — ver SeparacaoOrderPage).
 * Retorna null se o pedido não existir.
 */
export async function getOrderBranchId(orderId: string): Promise<{
	branchId: string | null;
	number: string;
	status: OrderStatus;
} | null> {
	const [row] = await db
		.select({
			branchId: order.branchId,
			number: order.number,
			status: order.status,
		})
		.from(order)
		.where(eq(order.id, orderId))
		.limit(1);
	return row ?? null;
}

/**
 * Retorna a sessão ATIVA (in_progress) ou a mais recente do pedido + seus itens.
 * Usa db.select (não db.execute) para evitar armadilha de timestamp-como-string.
 */
export async function getPickingForOrder(
	orderId: string
): Promise<{ picking: OrderPicking; items: OrderPickingItem[] } | null> {
	// Prefer in_progress; fallback to most recent completed/exception/canceled
	const [active] = await db
		.select()
		.from(orderPicking)
		.where(
			sql`${orderPicking.orderId} = ${orderId} AND ${orderPicking.status} = 'in_progress'`
		)
		.limit(1);

	const picking =
		active ??
		(
			await db
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.orderId, orderId))
				.orderBy(sql`${orderPicking.startedAt} DESC, ${orderPicking.id} DESC`)
				.limit(1)
		)[0];

	if (!picking) {
		return null;
	}

	const items = await db
		.select()
		.from(orderPickingItem)
		.where(eq(orderPickingItem.pickingId, picking.id))
		.orderBy(sql`${orderPickingItem.createdAt} ASC`);

	return { picking, items };
}

export interface LatestPickingInfo {
	completedAt: Date | null;
	exceptionReason: string | null;
	lastScannedAt: Date | null;
	pickedUnits: number;
	pickerName: string;
	pickerUserId: string | null;
	pickingId: string;
	startedAt: Date;
	status: OrderPickingStatus;
	totalUnits: number;
}

/**
 * Sessão de picking MAIS RECENTE do pedido — fonte única do sub-estado de
 * fulfillment (deriveFulfillmentState). Inclui progresso e última bipagem.
 */
export async function getLatestPicking(
	orderId: string
): Promise<LatestPickingInfo | null> {
	const result = await db.execute<{
		completed_at: string | null;
		exception_reason: string | null;
		last_scanned_at: string | null;
		picked_units: string;
		picker_name: string;
		picker_user_id: string | null;
		picking_id: string;
		started_at: string;
		status: OrderPickingStatus;
		total_units: string;
	}>(sql`
		SELECT
			op.id AS picking_id,
			op.status,
			op.picker_user_id,
			op.picker_name,
			op.started_at,
			op.completed_at,
			op.exception_reason,
			(SELECT COALESCE(SUM(pi.qty_picked), 0)::int
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS picked_units,
			(SELECT COALESCE(SUM(pi.qty_expected), 0)::int
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS total_units,
			(SELECT MAX(pi.last_scanned_at)
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS last_scanned_at
		FROM order_picking op
		WHERE op.order_id = ${orderId}
		ORDER BY op.started_at DESC, op.id DESC
		LIMIT 1
	`);

	const row = result.rows[0];
	if (!row) {
		return null;
	}
	return {
		pickingId: row.picking_id,
		status: row.status,
		pickerUserId: row.picker_user_id,
		pickerName: row.picker_name,
		startedAt: toDate(row.started_at),
		completedAt: row.completed_at ? toDate(row.completed_at) : null,
		exceptionReason: row.exception_reason,
		pickedUnits: Number(row.picked_units),
		totalUnits: Number(row.total_units),
		lastScannedAt: row.last_scanned_at ? toDate(row.last_scanned_at) : null,
	};
}

/**
 * Fila de separação paginada (keyset cursor, orderBy paidAt asc).
 *
 * Tabs:
 * - "a_separar"   → pedidos que precisam ser separados: status='paid' ou
 *   'preparing' (ex: separação cancelada) sem sessão in_progress/exception/completed
 * - "em_separacao" → pedidos status='preparing' com sessão order_picking in_progress
 * - "excecoes"    → pedidos com sessão order_picking status='exception'
 */
export async function fetchPickingQueuePage(args: {
	cursor: string | null;
	scope: BranchScope;
	tab: "a_separar" | "em_separacao" | "excecoes";
}): Promise<InfiniteResult<PickingQueueRow>> {
	const { cursor, scope, tab } = args;

	if (isBlindScope(scope)) {
		return { items: [], nextCursor: null };
	}

	const branchCondition = orderBranchCondition(scope);
	const branchFragment = branchCondition ? sql` AND ${branchCondition}` : sql``;

	// Keyset cursor by (paidAt ASC, id ASC)
	let cursorFragment = sql``;
	if (cursor) {
		const c = decodeCursorAs(cursor, "paidAtAsc");
		cursorFragment = sql` AND (o.paid_at, o.id) > (${c.paidAt}::timestamptz, ${c.id})`;
	}

	interface QueueRaw extends Record<string, unknown> {
		branch_id: string | null;
		branch_name: string | null;
		client_name: string;
		exception_reason: string | null;
		item_count: string;
		last_scanned_at: string | null;
		number: string;
		order_id: string;
		order_status: OrderStatus;
		paid_at: string;
		picked_units: string | null;
		picker_name: string | null;
		picking_id: string | null;
		picking_started_at: string | null;
		unit_count: string;
	}

	let rows: { rows: QueueRaw[] };

	if (tab === "a_separar") {
		// Última sessão de picking (se houver) não pode estar em andamento,
		// em exceção ou completada — só "canceled" ou inexistente entra aqui.
		rows = await db.execute<QueueRaw>(sql`
			SELECT
				o.id AS order_id,
				o.number,
				c.name AS client_name,
				o.branch_id,
				b.name AS branch_name,
				o.status AS order_status,
				o.paid_at,
				(SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS item_count,
				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
				NULL::text AS picking_id,
				NULL::text AS picker_name,
				NULL::int AS picked_units,
				NULL::timestamptz AS picking_started_at,
				NULL::timestamptz AS last_scanned_at,
				NULL::text AS exception_reason
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			LEFT JOIN branch b ON b.id = o.branch_id
			LEFT JOIN LATERAL (
				SELECT op.status FROM order_picking op
				WHERE op.order_id = o.id
				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
			) lp ON true
			WHERE o.status IN ('paid', 'preparing')
				AND (lp.status IS NULL OR lp.status = 'canceled')
				${branchFragment}
				${cursorFragment}
			ORDER BY o.paid_at ASC, o.id ASC
			LIMIT ${BATCH_SIZE + 1}
		`);
	} else if (tab === "em_separacao") {
		// Join direto por in_progress: a unique parcial (order_picking_one_active)
		// garante no máximo 1 sessão in_progress por pedido, e ela é sempre a mais
		// recente (não é possível abrir uma nova sessão com uma in_progress ativa).
		rows = await db.execute<QueueRaw>(sql`
			SELECT
				o.id AS order_id,
				o.number,
				c.name AS client_name,
				o.branch_id,
				b.name AS branch_name,
				o.status AS order_status,
				o.paid_at,
				(SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS item_count,
				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
				op.id AS picking_id,
				op.picker_name,
				(
					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
					FROM order_picking_item pi
					WHERE pi.picking_id = op.id
				) AS picked_units,
				op.started_at AS picking_started_at,
				(SELECT MAX(pi.last_scanned_at) FROM order_picking_item pi
					WHERE pi.picking_id = op.id) AS last_scanned_at,
				NULL::text AS exception_reason
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			LEFT JOIN branch b ON b.id = o.branch_id
			JOIN order_picking op ON op.order_id = o.id AND op.status = 'in_progress'
			WHERE o.status = 'preparing'
				${branchFragment}
				${cursorFragment}
			ORDER BY o.paid_at ASC, o.id ASC
			LIMIT ${BATCH_SIZE + 1}
		`);
	} else {
		// excecoes: pedidos cuja sessão de picking MAIS RECENTE está em exception.
		rows = await db.execute<QueueRaw>(sql`
			SELECT
				o.id AS order_id,
				o.number,
				c.name AS client_name,
				o.branch_id,
				b.name AS branch_name,
				o.status AS order_status,
				o.paid_at,
				(SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS item_count,
				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
				op.id AS picking_id,
				op.picker_name,
				(
					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
					FROM order_picking_item pi
					WHERE pi.picking_id = op.id
				) AS picked_units,
				NULL::timestamptz AS picking_started_at,
				NULL::timestamptz AS last_scanned_at,
				op.exception_reason AS exception_reason
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			LEFT JOIN branch b ON b.id = o.branch_id
			JOIN LATERAL (
				SELECT op.id, op.picker_name, op.status, op.exception_reason
				FROM order_picking op
				WHERE op.order_id = o.id
				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
			) op ON op.status = 'exception'
			WHERE o.status = 'preparing'
				${branchFragment}
				${cursorFragment}
			ORDER BY o.paid_at ASC, o.id ASC
			LIMIT ${BATCH_SIZE + 1}
		`);
	}

	return paginate(
		rows.rows,
		(row): PickingQueueRow => ({
			orderId: row.order_id,
			number: row.number,
			clientName: row.client_name,
			branchId: row.branch_id,
			branchName: row.branch_name,
			orderStatus: row.order_status,
			paidAt: row.paid_at ? toDate(row.paid_at) : null,
			itemCount: Number(row.item_count),
			unitCount: Number(row.unit_count),
			...(row.picking_id !== null && {
				pickingId: row.picking_id,
				pickerName: row.picker_name ?? undefined,
				pickedUnits: row.picked_units === null ? 0 : Number(row.picked_units),
			}),
			...(row.picking_started_at !== null && {
				pickingStartedAt: toDate(row.picking_started_at),
			}),
			...(row.last_scanned_at !== null && {
				lastScannedAt: toDate(row.last_scanned_at),
			}),
			...(row.exception_reason !== null && {
				exceptionReason: row.exception_reason,
			}),
		}),
		(last) => ({
			v: 1 as const,
			sort: "paidAtAsc" as const,
			paidAt: last.paid_at
				? toDate(last.paid_at).toISOString()
				: new Date(0).toISOString(),
			id: last.order_id,
		})
	);
}

export interface PickingQueueCounts {
	a_separar: number;
	em_separacao: number;
	excecoes: number;
}

/**
 * Contagem real (COUNT(*)) das 3 tabs da fila, branch-scoped. Substitui contar
 * `items.length` da 1ª página (capado em BATCH_SIZE) — o cabeçalho precisa do
 * total, não da página. Uma query só (3 subqueries) em vez de 3 fetches de página.
 */
export async function fetchPickingQueueCounts(
	scope: BranchScope
): Promise<PickingQueueCounts> {
	if (isBlindScope(scope)) {
		return { a_separar: 0, em_separacao: 0, excecoes: 0 };
	}

	const branchCondition = orderBranchCondition(scope);
	const branchFragment = branchCondition ? sql` AND ${branchCondition}` : sql``;

	const result = await db.execute<{
		a_separar: number;
		em_separacao: number;
		excecoes: number;
	}>(sql`
		SELECT
			(
				SELECT COUNT(*)::int FROM "order" o
				LEFT JOIN LATERAL (
					SELECT op.status FROM order_picking op
					WHERE op.order_id = o.id
					ORDER BY op.started_at DESC, op.id DESC LIMIT 1
				) lp ON true
				WHERE o.status IN ('paid', 'preparing')
					AND (lp.status IS NULL OR lp.status = 'canceled')
					${branchFragment}
			) AS a_separar,
			(
				SELECT COUNT(*)::int FROM "order" o
				JOIN order_picking op ON op.order_id = o.id AND op.status = 'in_progress'
				WHERE o.status = 'preparing'
					${branchFragment}
			) AS em_separacao,
			(
				SELECT COUNT(*)::int FROM "order" o
				JOIN LATERAL (
					SELECT op.status FROM order_picking op
					WHERE op.order_id = o.id
					ORDER BY op.started_at DESC, op.id DESC LIMIT 1
				) op ON op.status = 'exception'
				WHERE o.status = 'preparing'
					${branchFragment}
			) AS excecoes
	`);

	const row = result.rows[0];
	return {
		a_separar: row?.a_separar ?? 0,
		em_separacao: row?.em_separacao ?? 0,
		excecoes: row?.excecoes ?? 0,
	};
}

/**
 * Sessão in_progress do próprio usuário — dados para o banner de retomada.
 */
export async function getActivePickingForUser(
	userId: string,
	scope: BranchScope
): Promise<{
	orderId: string;
	number: string;
	clientName: string;
	pickedUnits: number;
	totalUnits: number;
} | null> {
	if (isBlindScope(scope)) {
		return null;
	}

	const branchCondition = orderBranchCondition(scope);
	const branchFragment = branchCondition ? sql` AND ${branchCondition}` : sql``;

	const result = await db.execute<{
		order_id: string;
		number: string;
		client_name: string;
		picking_id: string;
		picked_units: string;
		total_units: string;
	}>(sql`
		SELECT
			o.id AS order_id,
			o.number,
			c.name AS client_name,
			op.id AS picking_id,
			(
				SELECT COALESCE(SUM(pi.qty_picked), 0)::int
				FROM order_picking_item pi
				WHERE pi.picking_id = op.id
			) AS picked_units,
			(
				SELECT COALESCE(SUM(pi.qty_expected), 0)::int
				FROM order_picking_item pi
				WHERE pi.picking_id = op.id
			) AS total_units
		FROM order_picking op
		JOIN "order" o ON o.id = op.order_id
		JOIN client c ON c.id = o.client_id
		WHERE op.picker_user_id = ${userId}
			AND op.status = 'in_progress'
			${branchFragment}
		ORDER BY op.started_at DESC
		LIMIT 1
	`);

	const row = result.rows[0];
	if (!row) {
		return null;
	}

	return {
		orderId: row.order_id,
		number: row.number,
		clientName: row.client_name,
		pickedUnits: Number(row.picked_units),
		totalUnits: Number(row.total_units),
	};
}
