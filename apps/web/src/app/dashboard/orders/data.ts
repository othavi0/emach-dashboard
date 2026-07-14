import "server-only";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";
import { tool, toolImage } from "@emach/db/schema/tools";
import { toDate } from "@emach/db/utils";
import { cache } from "react";

export type { OrderStatus } from "@emach/db/schema/orders";

import {
	type OrderPickingStatus,
	type OrderStatus,
	orderAttachment,
	orderEvent,
	orderItem,
	orderNote,
	orderPicking,
	orderStatusHistory,
	refundRequest,
} from "@emach/db/schema/orders";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
	type BranchScope,
	getUserBranchScope,
	isBlindScope,
	orderBranchCondition,
	orderBranchConditionNoAlias,
	orderInScope,
} from "@/lib/branch-scope";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import type { FulfillmentState } from "../separacao/_lib/picking-logic";
import { deriveFulfillmentState } from "../separacao/_lib/picking-logic";
import { getLatestPicking } from "../separacao/data";
import { LATE_TAB_HOURS } from "./_lib/lateness";
import {
	buildOrdersListConditions,
	emptyTabCounts,
	foldTabCounts,
	type LateStatusFilter,
	normalizeDateParam,
	type OrderTabCounts,
	ordersTabSort,
	resolveTab,
} from "./_lib/orders-where";
import type { ALL_ORDERS_TAB, ORDER_TABS } from "./status-meta";

export interface OrderListFilters {
	branchId?: string;
	carrier?: string;
	from?: string;
	lateStatus?: LateStatusFilter;
	q?: string;
	tab?: string;
	to?: string;
	toolId?: string;
}

export interface OrderCardItem {
	imageUrl: string | null;
	name: string;
	quantity: number;
	toolId: string;
}

export interface OrderListItem {
	branchName: string | null;
	clientName: string;
	createdAt: Date;
	deliveredAt: Date | null;
	/** Sub-estado de fulfillment, só preenchido quando `status === "preparing"`. */
	fulfillmentState?: FulfillmentState | null;
	id: string;
	items: OrderCardItem[];
	/** Nº de LINHAS do pedido (usado pro "+N itens"); ver `unitsCount` p/ soma de quantidades. */
	itemsCount: number;
	number: string;
	paidAt: Date | null;
	pickerName: string | null;
	preparingAt: Date | null;
	shippedAt: Date | null;
	shippingMethod: string | null;
	shippingUnverified: boolean;
	status: OrderStatus;
	totalAmount: number;
	unitsCount: number;
}

export interface BranchOption {
	cepRanges: Array<{ from: string; to: string }> | null;
	id: string;
	name: string;
}

export interface OrderDetailItem {
	barcode: string | null;
	cest: string | null;
	discountAmount: number;
	heightCm: number | null;
	id: string;
	/** Imagem primária da ferramenta atual (best-effort por toolId; null se sem foto). */
	imageUrl: string | null;
	lengthCm: number | null;
	lineTotal: number;
	manufacturerName: string | null;
	model: string | null;
	name: string;
	ncm: string | null;
	orderId: string;
	quantity: number;
	sku: string | null;
	toolId: string;
	unitPrice: number;
	voltage: string | null;
	weightKg: number | null;
	widthCm: number | null;
}

export interface OrderHistoryItem {
	actorLabel: string;
	createdAt: Date;
	fromStatus: OrderStatus;
	id: string;
	reason: string | null;
	toStatus: OrderStatus;
}

export interface OrderNoteItem {
	authorName: string;
	body: string;
	createdAt: Date;
	id: string;
	pinned: boolean;
	statusAtCreation: OrderStatus | null;
}

export interface OrderRefundItem {
	amount: number;
	asaasRefundRef: string | null;
	id: string;
	reasonCategory: string;
	reasonText: string | null;
	rejectionReason: string | null;
	requestedAt: Date;
	resolvedAt: Date | null;
	status: string;
}

export interface OrderEventItem {
	actorLabel: string;
	createdAt: Date;
	eventType: string;
	id: string;
	metadata: Record<string, unknown> | null;
}

export interface OrderAttachmentItem {
	createdAt: Date;
	description: string | null;
	fileName: string;
	fileSize: number | null;
	id: string;
	label: string | null;
	mimeType: string | null;
	uploaderName: string;
}

export interface OrderPickingTimelineRow {
	completedAt: Date | null;
	exceptionReason: string | null;
	id: string;
	pickerName: string;
	startedAt: Date;
	status: "canceled" | "completed" | "exception" | "in_progress";
}

export interface ShippingAddressSnapshot {
	city?: string;
	complement?: string;
	country?: string;
	neighborhood?: string;
	number?: string;
	recipient?: string;
	state?: string;
	street?: string;
	zipCode?: string;
}

/**
 * Sub-estado de fulfillment do pedido, derivado da sessão de picking MAIS
 * RECENTE (ver `deriveFulfillmentState`). `null` no `OrderDetail.fulfillment`
 * representa "awaiting_picking" implícito (nenhuma sessão ainda) — o card de
 * UI trata os dois casos.
 */
export interface OrderFulfillment {
	completedAt: Date | null;
	exceptionReason: string | null;
	lastScannedAt: Date | null;
	pickedUnits: number;
	pickerName: string;
	pickerUserId: string | null;
	pickingId: string;
	startedAt: Date;
	state: FulfillmentState;
	totalUnits: number;
}

export interface OrderDetail {
	attachments: OrderAttachmentItem[];
	branchId: string | null;
	branchName: string | null;
	canceledAt: Date | null;
	clientDocument: string | null;
	clientEmail: string;
	clientId: string;
	clientImage: string | null;
	clientName: string;
	clientPhone: string | null;
	clientType: string | null;
	createdAt: Date;
	/** Observação preenchida pelo CLIENTE no checkout (ex.: "deixar com porteiro"). */
	customerNotes: string | null;
	deliveredAt: Date | null;
	discountAmount: number;
	events: OrderEventItem[];
	fulfillment: OrderFulfillment | null;
	history: OrderHistoryItem[];
	id: string;
	items: OrderDetailItem[];
	/** NF-e number emitted by the e-commerce app. Read-only in admin. */
	nfeNumber: string | null;
	/** NF-e status (e.g. "authorized", "canceled"). Read-only in admin. */
	nfeStatus: string | null;
	/** NF-e PDF/DANFE URL. Read-only in admin. */
	nfeUrl: string | null;
	/** NF-e XML URL. Read-only in admin. */
	nfeXmlUrl: string | null;
	notes: OrderNoteItem[];
	number: string;
	paidAt: Date | null;
	paymentMethod: string | null;
	paymentProviderRef: string | null;
	/** Asaas payment receipt URL. Read-only in admin. */
	paymentReceiptUrl: string | null;
	pickings: OrderPickingTimelineRow[];
	preparingAt: Date | null;
	refundedAt: Date | null;
	refundRequests: OrderRefundItem[];
	returnedAt: Date | null;
	shippedAt: Date | null;
	shippingAddress: ShippingAddressSnapshot;
	shippingAmount: number;
	shippingMethod: string | null;
	shippingTrackingCode: string | null;
	/** true = frete não revalidado no checkout (fail-open ecommerce); staff revisa. */
	shippingUnverified: boolean;
	status: OrderStatus;
	subtotalAmount: number;
	totalAmount: number;
}

function parseNumber(value: string | number | null): number | null {
	if (value === null) {
		return null;
	}
	return typeof value === "number" ? value : Number(value);
}

function formatActorLabel(entry: {
	actorType: "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	return entry.actorUserName ?? "Usuário";
}

export function getOrderTab(
	tab?: string
): (typeof ORDER_TABS)[number] | typeof ALL_ORDERS_TAB {
	return resolveTab(tab);
}

export function getOrderTabCountsKey(status: OrderStatus): string {
	return status;
}

export const listOrderBranches = cache(async (): Promise<BranchOption[]> => {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	const query = db
		.select({ cepRanges: branch.cepRanges, id: branch.id, name: branch.name })
		.from(branch)
		.orderBy(asc(branch.name));
	if (scope.kind === "all") {
		return query;
	}
	if (scope.branchIds.length === 0) {
		return [];
	}
	return db
		.select({ cepRanges: branch.cepRanges, id: branch.id, name: branch.name })
		.from(branch)
		.where(inArray(branch.id, scope.branchIds))
		.orderBy(asc(branch.name));
});

export interface OrdersPageFiltersInput {
	branchId?: string;
	carrier?: string;
	from?: string;
	lateStatus?: LateStatusFilter;
	q?: string;
	tab?: string;
	to?: string;
	toolId?: string;
}

export async function fetchOrdersPage({
	filters,
	cursor,
}: {
	filters: OrdersPageFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);

	if (isBlindScope(scope)) {
		return { items: [], nextCursor: null };
	}

	const tab = resolveTab(filters.tab);
	const sort = ordersTabSort(tab.key);
	// decodeCursorAs valida o discriminante — cursor de outra tab/sort estoura cedo.
	const decoded = cursor ? decodeCursorAs(cursor, sort) : null;

	const conditions = buildOrdersListConditions({
		filters: {
			branchId: filters.branchId,
			carrier: filters.carrier,
			from: normalizeDateParam(filters.from),
			lateStatus: filters.lateStatus,
			q: filters.q,
			to: normalizeDateParam(filters.to),
			toolId: filters.toolId,
		},
		scope,
		tabDef: tab,
	});
	if (decoded) {
		conditions.push(
			decoded.sort === "paidAtAsc"
				? sql`(COALESCE(o.paid_at, o.created_at), o.id) > (${decoded.paidAt}::timestamptz, ${decoded.id})`
				: sql`(o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		);
	}

	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;
	const orderBy =
		sort === "paidAtAsc"
			? sql`ORDER BY COALESCE(o.paid_at, o.created_at) ASC, o.id ASC`
			: sql`ORDER BY o.created_at DESC, o.id DESC`;

	const rows = await db.execute<{
		branch_name: string | null;
		client_name: string;
		created_at: Date;
		delivered_at: Date | null;
		fulfillment_age: Date;
		id: string;
		item_lines: OrderCardItem[] | null;
		items_count: number;
		latest_picking_picker: string | null;
		latest_picking_status: OrderPickingStatus | null;
		number: string;
		paid_at: Date | null;
		preparing_at: Date | null;
		shipped_at: Date | null;
		shipping_method: string | null;
		shipping_unverified: boolean;
		status: OrderStatus;
		total_amount: string;
		units_count: number;
	}>(sql`
		SELECT
			o.id, o.number, o.status, o.total_amount, o.created_at,
			o.paid_at, o.preparing_at, o.shipped_at, o.delivered_at,
			o.shipping_unverified, o.shipping_method,
			COALESCE(o.paid_at, o.created_at) AS fulfillment_age,
			c.name AS client_name, b.name AS branch_name,
			(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count,
			(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi WHERE oi.order_id = o.id)::int AS units_count,
			li.items AS item_lines,
			lp.status AS latest_picking_status, lp.picker_name AS latest_picking_picker
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN branch b ON b.id = o.branch_id
		LEFT JOIN LATERAL (
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'toolId', x.tool_id, 'name', x.name,
				'quantity', x.quantity, 'imageUrl', x.image_url
			) ORDER BY x.quantity DESC, x.name ASC), '[]'::jsonb) AS items
			FROM (
				SELECT oi.tool_id, oi.name, oi.quantity,
					(SELECT ti.url FROM tool_image ti
					 WHERE ti.tool_id = oi.tool_id
					 ORDER BY ti.sort_order ASC LIMIT 1) AS image_url
				FROM order_item oi
				WHERE oi.order_id = o.id
				ORDER BY oi.quantity DESC, oi.name ASC
				LIMIT 3
			) x
		) li ON true
		LEFT JOIN LATERAL (
			SELECT op.status, op.picker_name FROM order_picking op
			WHERE op.order_id = o.id
			ORDER BY op.started_at DESC, op.id DESC LIMIT 1
		) lp ON o.status = 'preparing'
		${whereClause}
		${orderBy}
		LIMIT ${BATCH_SIZE + 1}
	`);

	return paginate(
		rows.rows,
		(row) => ({
			id: row.id,
			number: row.number,
			status: row.status,
			totalAmount: Number(row.total_amount),
			itemsCount: row.items_count,
			unitsCount: row.units_count,
			items: row.item_lines ?? [],
			createdAt: toDate(row.created_at),
			paidAt: row.paid_at ? toDate(row.paid_at) : null,
			pickerName:
				row.status === "preparing" ? (row.latest_picking_picker ?? null) : null,
			preparingAt: row.preparing_at ? toDate(row.preparing_at) : null,
			shippedAt: row.shipped_at ? toDate(row.shipped_at) : null,
			deliveredAt: row.delivered_at ? toDate(row.delivered_at) : null,
			clientName: row.client_name,
			branchName: row.branch_name,
			shippingMethod: row.shipping_method,
			shippingUnverified: row.shipping_unverified,
			fulfillmentState:
				row.status === "preparing"
					? deriveFulfillmentState(row.latest_picking_status ?? null)
					: null,
		}),
		(last) =>
			sort === "paidAtAsc"
				? {
						v: 1 as const,
						sort: "paidAtAsc" as const,
						paidAt: toDate(last.fulfillment_age).toISOString(),
						id: last.id,
					}
				: {
						v: 1 as const,
						sort: "newest" as const,
						createdAt: toDate(last.created_at).toISOString(),
						id: last.id,
					}
	);
}

export interface OrderActivityRow {
	createdAt: Date;
	id: string;
	orderId: string;
	orderNumber: string;
	toStatus: OrderStatus;
}

export async function getRecentOrderActivity(
	limit = 15
): Promise<OrderActivityRow[]> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const result = await db.execute<{
		created_at: Date;
		id: string;
		order_id: string;
		order_number: string;
		to_status: OrderStatus;
	}>(sql`
		SELECT
			osh.id,
			osh.order_id,
			o.number AS order_number,
			osh.to_status,
			osh.created_at
		FROM order_status_history osh
		JOIN "order" o ON o.id = osh.order_id
		${branchCond ? sql`WHERE ${branchCond}` : sql``}
		ORDER BY osh.created_at DESC
		LIMIT ${limit}
	`);
	return result.rows.map((r) => ({
		id: r.id,
		orderId: r.order_id,
		orderNumber: r.order_number,
		toStatus: r.to_status,
		createdAt: toDate(r.created_at),
	}));
}

// TTL curto: os counts são um badge informativo e a tabela `order` também é
// escrita pelo app ecommerce (banco compartilhado), que NÃO dispara revalidação
// no dashboard. O TTL limita a defasagem máxima; mutações do dashboard revalidam
// via ORDERS_COUNTS_TAG. A LISTA de pedidos segue sem cache (sempre fresca).
const ORDERS_COUNTS_TTL_SECONDS = 30;
export const ORDERS_COUNTS_TAG = "orders-counts";

// Cacheado por branch-scope: o `scope` entra na chave do unstable_cache (os args
// fazem parte da chave), então cada filial tem sua própria entrada — sem vazar
// contagem de uma filial para outra. `scope` é puro/serializável e a query é
// reconstruída a partir dele (nada de session/headers aqui dentro).
const computeOrdersTabCounts = unstable_cache(
	async (scope: BranchScope): Promise<OrderTabCounts> => {
		const branchFilter = orderBranchConditionNoAlias(scope);
		const result = await db.execute<{
			count: number;
			is_late: boolean;
			is_picked: boolean;
			status: OrderStatus;
		}>(sql`
			SELECT status,
				(status IN ('paid','preparing')
				 AND (CASE WHEN status = 'preparing'
					THEN COALESCE(preparing_at, paid_at, created_at)
					ELSE COALESCE(paid_at, created_at) END)
					<= now() - make_interval(hours => ${LATE_TAB_HOURS})
				) AS is_late,
				COALESCE(status = 'preparing' AND (
					SELECT op.status FROM order_picking op
					WHERE op.order_id = "order".id
					ORDER BY op.started_at DESC, op.id DESC LIMIT 1
				) = 'completed', false) AS is_picked,
				COUNT(*)::int AS count
			FROM "order"
			${branchFilter ? sql`WHERE ${branchFilter}` : sql``}
			GROUP BY 1, 2, 3
		`);

		return foldTabCounts(result.rows);
	},
	["orders-tab-counts"],
	{ revalidate: ORDERS_COUNTS_TTL_SECONDS, tags: [ORDERS_COUNTS_TAG] }
);

export async function getOrdersTabCounts(): Promise<Record<string, number>> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (isBlindScope(scope)) {
		return emptyTabCounts();
	}
	return computeOrdersTabCounts(scope);
}

// Consumida pela página de Separação (fila de atrasados fora da listagem).
export async function getLateOrdersCount(scope: BranchScope): Promise<number> {
	if (isBlindScope(scope)) {
		return 0;
	}
	const counts = await computeOrdersTabCounts(scope);
	return counts.late;
}

// DISTINCT shipping_method no escopo — popula o facet de transportadora do filtro.
export async function listOrderCarrierOptions(): Promise<{
	hasUnassigned: boolean;
	methods: string[];
}> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (isBlindScope(scope)) {
		return { methods: [], hasUnassigned: false };
	}
	const branchCondition = orderBranchCondition(scope);
	const rows = await db.execute<{ shipping_method: string | null }>(sql`
		SELECT DISTINCT o.shipping_method FROM "order" o
		${branchCondition ? sql`WHERE ${branchCondition}` : sql``}
		ORDER BY 1
	`);
	const methods = rows.rows
		.map((r) => r.shipping_method)
		.filter((m): m is string => m !== null);
	return {
		methods,
		hasUnassigned: rows.rows.some((r) => r.shipping_method === null),
	};
}

// Produtos ativos do catálogo — popula o facet de produto do filtro (Catálogo
// é global, sem branch-scoping — ver CLAUDE.md).
export async function listOrderToolOptions(): Promise<
	{ id: string; name: string }[]
> {
	await requireCurrentSession();
	return db
		.select({ id: tool.id, name: tool.name })
		.from(tool)
		.where(eq(tool.status, "active"))
		.orderBy(asc(tool.name));
}

// Resumo (pedidos/unidades) do produto filtrado por toolId — usado no header
// da listagem quando o filtro de produto está ativo (renderiza server-side).
export async function fetchOrdersProductSummary({
	filters,
}: {
	filters: OrdersPageFiltersInput;
}): Promise<{ orders: number; units: number } | null> {
	if (!filters.toolId) {
		return null;
	}
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (isBlindScope(scope)) {
		return { orders: 0, units: 0 };
	}
	const tab = resolveTab(filters.tab);
	const conditions = buildOrdersListConditions({
		filters: {
			branchId: filters.branchId,
			carrier: filters.carrier,
			from: normalizeDateParam(filters.from),
			lateStatus: filters.lateStatus,
			q: filters.q,
			to: normalizeDateParam(filters.to),
			toolId: filters.toolId,
		},
		scope,
		tabDef: tab,
	});
	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;
	const rows = await db.execute<{ orders: number; units: number }>(sql`
		SELECT COUNT(DISTINCT o.id)::int AS orders,
			COALESCE(SUM(oi.quantity), 0)::int AS units
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		JOIN order_item oi ON oi.order_id = o.id AND oi.tool_id = ${filters.toolId}
		${whereClause}
	`);
	return rows.rows[0] ?? { orders: 0, units: 0 };
}

// Nome do produto filtrado por productId — usado no chip do resumo acima da lista.
export async function getToolName(id: string): Promise<string | null> {
	await requireCurrentSession();
	const rows = await db
		.select({ name: tool.name })
		.from(tool)
		.where(eq(tool.id, id))
		.limit(1);
	return rows[0]?.name ?? null;
}

export type OrderReviewState =
	| "no_review_open"
	| "no_review_expired"
	| "has_review"
	| "order_not_paid";

export interface OrderReviewRow {
	daysRemaining: number | null;
	review: {
		id: string;
		rating: number;
		status: string;
	} | null;
	reviewState: OrderReviewState;
	thumbUrl: string | null;
	toolId: string;
	toolName: string;
}

export async function getOrderReviewsOverview(
	orderId: string
): Promise<OrderReviewRow[]> {
	const result = await db.execute<{
		tool_id: string;
		tool_name: string;
		thumb_url: string | null;
		review_id: string | null;
		rating: number | null;
		review_status: string | null;
		review_state: OrderReviewState;
		days_remaining: number | null;
	}>(sql`
		WITH order_meta AS (
			SELECT id, paid_at,
				(paid_at + interval '90 days') AS review_deadline
			FROM "order" WHERE id = ${orderId}
		),
		tools_in_order AS (
			SELECT DISTINCT ON (oi.tool_id)
				oi.tool_id,
				t.name AS tool_name,
				(
					SELECT ti.url FROM tool_image ti
					WHERE ti.tool_id = t.id
					ORDER BY ti.sort_order ASC
					LIMIT 1
				) AS thumb_url
			FROM order_item oi
			JOIN tool t ON t.id = oi.tool_id
			WHERE oi.order_id = ${orderId}
		)
		SELECT
			tio.tool_id,
			tio.tool_name,
			tio.thumb_url,
			r.id AS review_id,
			r.rating,
			r.status AS review_status,
			CASE
				WHEN om.paid_at IS NULL THEN 'order_not_paid'
				WHEN r.id IS NOT NULL THEN 'has_review'
				WHEN now() > om.review_deadline THEN 'no_review_expired'
				ELSE 'no_review_open'
			END AS review_state,
			CASE
				WHEN om.paid_at IS NULL THEN NULL
				ELSE GREATEST(0, EXTRACT(day FROM (om.review_deadline - now())))::int
			END AS days_remaining
		FROM tools_in_order tio
		CROSS JOIN order_meta om
		LEFT JOIN review r
			ON r.order_id = ${orderId} AND r.tool_id = tio.tool_id
		ORDER BY tio.tool_name ASC
	`);

	return result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		thumbUrl: row.thumb_url,
		review:
			row.review_id && row.rating !== null && row.review_status
				? {
						id: row.review_id,
						rating: Number(row.rating),
						status: row.review_status,
					}
				: null,
		reviewState: row.review_state,
		daysRemaining:
			row.days_remaining === null ? null : Number(row.days_remaining),
	}));
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	const [
		base,
		items,
		history,
		notes,
		attachmentRows,
		refundRows,
		eventRows,
		pickingRows,
		imageRows,
	] = await Promise.all([
		db.execute<{
			branch_id: string | null;
			branch_name: string | null;
			canceled_at: Date | null;
			returned_at: Date | null;
			refunded_at: Date | null;
			client_email: string;
			client_id: string;
			client_name: string;
			client_phone: string | null;
			created_at: Date;
			delivered_at: Date | null;
			id: string;
			nfe_number: string | null;
			customer_notes: string | null;
			nfe_status: string | null;
			nfe_url: string | null;
			nfe_xml_url: string | null;
			number: string;
			paid_at: Date | null;
			payment_method: string | null;
			payment_provider_ref: string | null;
			payment_receipt_url: string | null;
			shipping_address: ShippingAddressSnapshot;
			shipping_amount: string;
			shipping_method: string | null;
			shipping_tracking_code: string | null;
			shipping_unverified: boolean;
			shipped_at: Date | null;
			status: OrderStatus;
			subtotal_amount: string;
			total_amount: string;
			discount_amount: string;
			client_document: string | null;
			client_image: string | null;
			client_type: string | null;
			preparing_at: Date | null;
		}>(sql`
			SELECT
				o.id,
				o.number,
				o.status,
				o.payment_method,
				o.payment_provider_ref,
				o.subtotal_amount,
				o.shipping_amount,
				o.total_amount,
				o.discount_amount,
				o.shipping_address,
				o.shipping_method,
				o.shipping_tracking_code,
				o.shipping_unverified,
				o.created_at,
				o.paid_at,
				o.preparing_at,
				o.shipped_at,
				o.delivered_at,
				o.canceled_at,
				o.returned_at,
				o.refunded_at,
				o.branch_id,
				o.payment_receipt_url,
				o.nfe_number,
				o.nfe_url,
				o.nfe_xml_url,
				o.nfe_status,
				o.notes AS customer_notes,
				c.id AS client_id,
				c.name AS client_name,
				c.email AS client_email,
				c.phone AS client_phone,
				c.document AS client_document,
				c.image AS client_image,
				c.client_type AS client_type,
				b.name AS branch_name
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			LEFT JOIN branch b ON b.id = o.branch_id
			WHERE o.id = ${id}
			LIMIT 1
		`),
		db
			.select()
			.from(orderItem)
			.where(eq(orderItem.orderId, id))
			.orderBy(asc(orderItem.name)),
		db
			.select({
				actorType: orderStatusHistory.actorType,
				actorUserName: user.name,
				createdAt: orderStatusHistory.createdAt,
				fromStatus: orderStatusHistory.fromStatus,
				id: orderStatusHistory.id,
				reason: orderStatusHistory.reason,
				toStatus: orderStatusHistory.toStatus,
			})
			.from(orderStatusHistory)
			.leftJoin(user, eq(orderStatusHistory.actorUserId, user.id))
			.where(eq(orderStatusHistory.orderId, id))
			.orderBy(desc(orderStatusHistory.createdAt)),
		db
			.select({
				authorName: user.name,
				body: orderNote.body,
				createdAt: orderNote.createdAt,
				id: orderNote.id,
				pinned: orderNote.pinned,
				statusAtCreation: orderNote.statusAtCreation,
			})
			.from(orderNote)
			.leftJoin(user, eq(orderNote.authorId, user.id))
			.where(eq(orderNote.orderId, id))
			.orderBy(desc(orderNote.createdAt)),
		db
			.select({
				id: orderAttachment.id,
				fileUrl: orderAttachment.fileUrl,
				fileName: orderAttachment.fileName,
				description: orderAttachment.description,
				fileSize: orderAttachment.fileSize,
				mimeType: orderAttachment.mimeType,
				label: orderAttachment.label,
				createdAt: orderAttachment.createdAt,
				uploaderName: user.name,
			})
			.from(orderAttachment)
			.leftJoin(user, eq(orderAttachment.uploadedBy, user.id))
			.where(eq(orderAttachment.orderId, id))
			.orderBy(desc(orderAttachment.createdAt)),
		db
			.select({
				id: refundRequest.id,
				reasonCategory: refundRequest.reasonCategory,
				reasonText: refundRequest.reasonText,
				status: refundRequest.status,
				amount: refundRequest.amount,
				asaasRefundRef: refundRequest.asaasRefundRef,
				rejectionReason: refundRequest.rejectionReason,
				requestedAt: refundRequest.requestedAt,
				resolvedAt: refundRequest.resolvedAt,
			})
			.from(refundRequest)
			.where(eq(refundRequest.orderId, id))
			.orderBy(desc(refundRequest.requestedAt)),
		db
			.select({
				id: orderEvent.id,
				eventType: orderEvent.eventType,
				metadata: orderEvent.metadata,
				actorType: orderEvent.actorType,
				actorUserName: user.name,
				createdAt: orderEvent.createdAt,
			})
			.from(orderEvent)
			.leftJoin(user, eq(orderEvent.actorUserId, user.id))
			.where(eq(orderEvent.orderId, id))
			.orderBy(desc(orderEvent.createdAt)),
		db
			.select({
				id: orderPicking.id,
				status: orderPicking.status,
				pickerName: orderPicking.pickerName,
				startedAt: orderPicking.startedAt,
				completedAt: orderPicking.completedAt,
				exceptionReason: orderPicking.exceptionReason,
			})
			.from(orderPicking)
			.where(eq(orderPicking.orderId, id))
			.orderBy(asc(orderPicking.startedAt)),
		// Imagem primária por ferramenta (best-effort): o item é snapshot fiscal e
		// não guarda imagem; buscamos a foto atual da tool (menor sortOrder) via
		// subquery em orderItem, mantendo a query paralela ao restante do detalhe.
		db
			.selectDistinctOn([toolImage.toolId], {
				toolId: toolImage.toolId,
				url: toolImage.url,
			})
			.from(toolImage)
			.where(
				inArray(
					toolImage.toolId,
					db
						.select({ toolId: orderItem.toolId })
						.from(orderItem)
						.where(eq(orderItem.orderId, id))
				)
			)
			.orderBy(toolImage.toolId, asc(toolImage.sortOrder)),
	]);

	const row = base.rows[0];
	if (!row) {
		return null;
	}
	// Branch-scoping: pedido fora do escopo do staff é invisível (404), inclusive triagem p/ user.
	if (!orderInScope(scope, row.branch_id)) {
		return null;
	}

	// Sub-estado de fulfillment: fonte é a sessão de picking MAIS RECENTE do
	// pedido (não `order.status`, que fica intocado — contrato ecommerce).
	const latest = await getLatestPicking(id);
	const fulfillment: OrderFulfillment | null = latest
		? {
				pickingId: latest.pickingId,
				state: deriveFulfillmentState(latest.status),
				pickerUserId: latest.pickerUserId,
				pickerName: latest.pickerName,
				startedAt: latest.startedAt,
				completedAt: latest.completedAt,
				exceptionReason: latest.exceptionReason,
				pickedUnits: latest.pickedUnits,
				totalUnits: latest.totalUnits,
				lastScannedAt: latest.lastScannedAt,
			}
		: null;

	const imageByTool = new Map(imageRows.map((r) => [r.toolId, r.url]));

	// Private bucket: storage paths are persisted; URLs are signed on demand via
	// signOrderAttachment (see _components/attachment-actions.ts).
	const attachments: OrderAttachmentItem[] = attachmentRows.map((att) => ({
		id: att.id,
		fileName: att.fileName,
		fileSize: att.fileSize,
		mimeType: att.mimeType,
		label: att.label,
		description: att.description,
		createdAt: att.createdAt,
		uploaderName: att.uploaderName ?? "Sistema",
	}));

	return {
		attachments,
		fulfillment,
		id: row.id,
		number: row.number,
		status: row.status,
		clientId: row.client_id,
		clientName: row.client_name,
		clientImage: row.client_image,
		customerNotes: row.customer_notes,
		clientEmail: row.client_email,
		clientPhone: row.client_phone,
		clientDocument: row.client_document,
		clientType: row.client_type,
		discountAmount: Number(row.discount_amount),
		branchId: row.branch_id,
		branchName: row.branch_name,
		paymentMethod: row.payment_method,
		paymentProviderRef: row.payment_provider_ref,
		paymentReceiptUrl: row.payment_receipt_url,
		nfeNumber: row.nfe_number,
		nfeUrl: row.nfe_url,
		nfeXmlUrl: row.nfe_xml_url,
		nfeStatus: row.nfe_status,
		subtotalAmount: Number(row.subtotal_amount),
		shippingAmount: Number(row.shipping_amount),
		totalAmount: Number(row.total_amount),
		shippingAddress: row.shipping_address ?? {},
		shippingMethod: row.shipping_method,
		shippingTrackingCode: row.shipping_tracking_code,
		shippingUnverified: row.shipping_unverified,
		createdAt: toDate(row.created_at),
		paidAt: toDate(row.paid_at),
		preparingAt: toDate(row.preparing_at),
		shippedAt: toDate(row.shipped_at),
		deliveredAt: toDate(row.delivered_at),
		canceledAt: toDate(row.canceled_at),
		returnedAt: toDate(row.returned_at),
		refundedAt: toDate(row.refunded_at),
		items: items.map((item) => ({
			id: item.id,
			orderId: item.orderId,
			toolId: item.toolId,
			imageUrl: imageByTool.get(item.toolId) ?? null,
			sku: item.sku,
			barcode: item.barcode,
			name: item.name,
			model: item.model,
			voltage: item.voltage,
			unitPrice: Number(item.unitPrice),
			quantity: item.quantity,
			lineTotal: Number(item.lineTotal),
			discountAmount: Number(item.discountAmount),
			ncm: item.ncm,
			cest: item.cest,
			manufacturerName: item.manufacturerName,
			weightKg: parseNumber(item.weightKg),
			lengthCm: parseNumber(item.lengthCm),
			widthCm: parseNumber(item.widthCm),
			heightCm: parseNumber(item.heightCm),
		})),
		history: history.map((entry) => ({
			id: entry.id,
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			reason: entry.reason,
			createdAt: entry.createdAt,
			actorLabel: formatActorLabel(entry),
		})),
		notes: notes.map((note) => ({
			id: note.id,
			body: note.body,
			createdAt: note.createdAt,
			authorName: note.authorName ?? "Sistema",
			pinned: note.pinned,
			statusAtCreation: note.statusAtCreation,
		})),
		refundRequests: refundRows.map((r) => ({
			id: r.id,
			reasonCategory: r.reasonCategory,
			reasonText: r.reasonText,
			status: r.status,
			amount: Number(r.amount),
			asaasRefundRef: r.asaasRefundRef,
			rejectionReason: r.rejectionReason,
			requestedAt: r.requestedAt,
			resolvedAt: r.resolvedAt,
		})),
		events: eventRows.map((e) => ({
			id: e.id,
			eventType: e.eventType,
			metadata: (e.metadata ?? null) as Record<string, unknown> | null,
			actorLabel: formatActorLabel({
				actorType: e.actorType,
				actorUserName: e.actorUserName,
			}),
			createdAt: e.createdAt,
		})),
		pickings: pickingRows.map((p) => ({
			id: p.id,
			status: p.status,
			pickerName: p.pickerName,
			startedAt: p.startedAt,
			completedAt: p.completedAt,
			exceptionReason: p.exceptionReason,
		})),
	};
}
