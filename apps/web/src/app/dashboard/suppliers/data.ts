import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";
import { supplier } from "@emach/db/schema/tools";
import { toDate } from "@emach/db/utils";
import { desc, eq, sql } from "drizzle-orm";

import { type BranchScope, branchAndFilter } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

/** tool_ids fornecidos por um supplier = têm ≥1 entrada_compra dele (ADR-0015). */
const supplierToolIds = (supplierId: string) =>
	sql`SELECT DISTINCT tv.tool_id FROM stock_movement sm JOIN tool_variant tv ON tv.id = sm.variant_id WHERE sm.reason = 'entrada_compra' AND sm.supplier_id = ${supplierId}`;

export interface SupplierDetail {
	cnpj: string | null;
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	notes: string | null;
	phone: string | null;
	status: "active" | "archived";
	toolsActive: number;
	toolsInactive: number;
	toolsTotal: number;
	updatedAt: Date;
	website: string | null;
}

export async function getSupplierDetail(
	id: string
): Promise<SupplierDetail | null> {
	const [base] = await db
		.select()
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);
	if (!base) {
		return null;
	}
	// Derivação: tools fornecidas = tools com ≥1 entrada_compra deste fornecedor (ADR-0015).
	// Usa db.execute raw porque count + FILTER no query builder funciona, mas
	// precisamos do WHERE com subquery e o shape retornado vem snake_case do driver.
	const rows = await db.execute<{
		total: string;
		active: string;
		inactive: string;
	}>(sql`
		SELECT
			count(*)::int AS "total",
			count(*) FILTER (WHERE t.status = 'active')::int AS "active",
			count(*) FILTER (WHERE t.status <> 'active')::int AS "inactive"
		FROM tool t
		WHERE t.id IN (${supplierToolIds(id)})
	`);
	const counts = rows.rows[0];
	return {
		id: base.id,
		name: base.name,
		status: base.status,
		contactEmail: base.contactEmail,
		phone: base.phone,
		website: base.website,
		cnpj: base.cnpj,
		notes: base.notes,
		createdAt: base.createdAt,
		updatedAt: base.updatedAt,
		toolsTotal: Number(counts?.total ?? 0),
		toolsActive: Number(counts?.active ?? 0),
		toolsInactive: Number(counts?.inactive ?? 0),
	};
}

export interface SupplierDetailKpis {
	activeTools: number;
	categoriesCovered: number;
	inactiveTools: number;
	lastToolAddedAt: Date | null;
}

export async function getSupplierDetailKpis(
	supplierId: string
): Promise<SupplierDetailKpis> {
	// Tools derivadas: todas com ≥1 entrada_compra deste fornecedor.
	// lastToolAddedAt = data da última entrada_compra do fornecedor (não criação da tool).
	const [countRows, catRows] = await Promise.all([
		db.execute<{
			active: string;
			inactive: string;
			lastEntrada: string | null;
		}>(sql`
		SELECT
			count(*) FILTER (WHERE t.status = 'active')::int AS "active",
			count(*) FILTER (WHERE t.status <> 'active')::int AS "inactive",
			(
				SELECT MAX(sm2.created_at)
				FROM stock_movement sm2
				WHERE sm2.reason = 'entrada_compra' AND sm2.supplier_id = ${supplierId}
			) AS "lastEntrada"
		FROM tool t
		WHERE t.id IN (${supplierToolIds(supplierId)})
	`),
		db.execute<{ n: string }>(sql`
		SELECT count(DISTINCT tc.category_id)::int AS "n"
		FROM tool_category tc
		WHERE tc.tool_id IN (${supplierToolIds(supplierId)})
	`),
	]);

	const counts = countRows.rows[0];
	const cats = catRows.rows[0];
	return {
		activeTools: Number(counts?.active ?? 0),
		inactiveTools: Number(counts?.inactive ?? 0),
		// lastToolAddedAt reutilizado como "data da última entrada deste fornecedor"
		// para não alterar a interface consumida por overview-tab.tsx.
		lastToolAddedAt: counts?.lastEntrada ? toDate(counts.lastEntrada) : null,
		categoriesCovered: Number(cats?.n ?? 0),
	};
}

export interface SupplierStockToolRow {
	category: string | null;
	createdAt: Date;
	defaultSku: string | null;
	/** Estoque geral: soma de todas as variantes × filiais da tool. */
	generalStock: number;
	id: string;
	imageUrl: string | null;
	name: string;
	/** Total recebido deste fornecedor (soma dos deltas de entrada_compra dele). */
	receivedFromSupplier: number;
	slug: string;
	status: "draft" | "active" | "discontinued";
}

export async function getSupplierStockTools({
	supplierId,
	search,
	cursor,
	scope,
}: {
	supplierId: string;
	search?: string;
	cursor: string | null;
	scope: BranchScope;
}): Promise<InfiniteResult<SupplierStockToolRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;

	// Cláusulas adicionais após a condição de derivação.
	const searchClause = search?.trim()
		? sql` AND (t.name ILIKE ${`%${search.trim()}%`} OR t.slug ILIKE ${`%${search.trim()}%`})`
		: sql``;

	const cursorClause =
		decoded && decoded.sort === "newest"
			? sql` AND (t.created_at, t.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			: sql``;

	// Filtro de scope nas subqueries de estoque/entradas (super_admin → cross-filial).
	const stockScopeFilter = branchAndFilter(scope, sql`sl.branch_id`);
	const movementScopeFilter = branchAndFilter(scope, sql`sm2.branch_id`);

	// db.execute raw: subqueries escalares correlacionadas retornam null no db.select builder
	// (armadilha documentada em packages/db/CLAUDE.md). Colunas aliasadas em camelCase.
	const result = await db.execute<{
		id: string;
		name: string;
		slug: string;
		status: string;
		created_at: string;
		generalStock: string;
		receivedFromSupplier: string;
	}>(sql`
		SELECT
			t.id,
			t.name,
			t.slug,
			t.status,
			t.created_at,
			COALESCE((
				SELECT SUM(sl.quantity)
				FROM stock_level sl
				JOIN tool_variant tv2 ON tv2.id = sl.variant_id
				WHERE tv2.tool_id = t.id${stockScopeFilter}
			), 0) AS "generalStock",
			COALESCE((
				SELECT SUM(sm2.delta)
				FROM stock_movement sm2
				JOIN tool_variant tv3 ON tv3.id = sm2.variant_id
				WHERE tv3.tool_id = t.id
				  AND sm2.reason = 'entrada_compra'
				  AND sm2.supplier_id = ${supplierId}${movementScopeFilter}
			), 0) AS "receivedFromSupplier"
		FROM tool t
		WHERE t.id IN (${supplierToolIds(supplierId)})${searchClause}${cursorClause}
		ORDER BY t.created_at DESC, t.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);

	// NOTE(045): paginate() não se aplica aqui — o enriquecimento assíncrono
	// (getToolCardMeta) ocorre entre o slice e a montagem de items, quebrando o
	// contrato do mapRow síncrono de paginate(). Manter hand-rolled.
	const rawRows = result.rows;
	const hasMore = rawRows.length > BATCH_SIZE;
	const pageRows = hasMore ? rawRows.slice(0, BATCH_SIZE) : rawRows;

	// Enriquecimento de defaultSku/imageUrl/category via segundo passo (getToolCardMeta),
	// porque subqueries escalares correlacionadas no db.select builder retornam null.
	const meta = await getToolCardMeta(pageRows.map((r) => r.id));

	const items: SupplierStockToolRow[] = pageRows.map((r) => {
		const m = meta.get(r.id);
		return {
			id: r.id,
			name: r.name,
			slug: r.slug ?? "",
			status: r.status as SupplierStockToolRow["status"],
			createdAt: toDate(r.created_at),
			generalStock: Number(r.generalStock),
			receivedFromSupplier: Number(r.receivedFromSupplier),
			defaultSku: m?.defaultSku ?? null,
			imageUrl: m?.imageUrl ?? null,
			category: m?.category ?? null,
		};
	});

	const lastRaw = pageRows.at(-1);
	const nextCursor =
		hasMore && lastRaw
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: toDate(lastRaw.created_at).toISOString(),
					id: lastRaw.id,
				})
			: null;

	return { items, nextCursor };
}

export interface SupplierAuditRow {
	action: string;
	actorName: string | null;
	afterJson: Record<string, unknown> | null;
	beforeJson: Record<string, unknown> | null;
	createdAt: Date;
	id: string;
	reason: string | null;
}

export async function getSupplierAuditLog(
	supplierId: string,
	limit = 50
): Promise<SupplierAuditRow[]> {
	const rows = await db
		.select({
			id: supplierAuditLog.id,
			action: supplierAuditLog.action,
			actorName: userTable.name,
			beforeJson: supplierAuditLog.beforeJson,
			afterJson: supplierAuditLog.afterJson,
			reason: supplierAuditLog.reason,
			createdAt: supplierAuditLog.createdAt,
		})
		.from(supplierAuditLog)
		.leftJoin(userTable, eq(userTable.id, supplierAuditLog.actorUserId))
		.where(eq(supplierAuditLog.supplierId, supplierId))
		.orderBy(desc(supplierAuditLog.createdAt))
		.limit(limit);
	return rows as SupplierAuditRow[];
}

export interface SupplierTableRow {
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	phone: string | null;
	status: "active" | "archived";
	toolsActive: number;
	toolsTotal: number;
}

export async function getSupplierTableAggregates(
	supplierIds: string[]
): Promise<Map<string, { toolsTotal: number; toolsActive: number }>> {
	if (supplierIds.length === 0) {
		return new Map();
	}

	// Derivação: tools fornecidas = tools com ≥1 entrada_compra do fornecedor.
	// Agrupamos por supplier_id para cobrir todos os IDs de uma vez.
	const idList = sql.join(
		supplierIds.map((sid) => sql`${sid}`),
		sql`, `
	);
	const result = await db.execute<{
		supplierId: string;
		total: string;
		active: string;
	}>(sql`
		SELECT
			sm.supplier_id AS "supplierId",
			count(DISTINCT t.id)::int AS "total",
			count(DISTINCT t.id) FILTER (WHERE t.status = 'active')::int AS "active"
		FROM stock_movement sm
		JOIN tool_variant tv ON tv.id = sm.variant_id
		JOIN tool t ON t.id = tv.tool_id
		WHERE sm.reason = 'entrada_compra'
		  AND sm.supplier_id IN (${idList})
		GROUP BY sm.supplier_id
	`);

	const map = new Map<string, { toolsTotal: number; toolsActive: number }>();
	for (const id of supplierIds) {
		map.set(id, { toolsTotal: 0, toolsActive: 0 });
	}
	for (const r of result.rows) {
		if (r.supplierId) {
			map.set(r.supplierId, {
				toolsTotal: Number(r.total),
				toolsActive: Number(r.active),
			});
		}
	}
	return map;
}

export interface ToolCardMeta {
	category: string | null;
	defaultSku: string | null;
	imageUrl: string | null;
}

/**
 * Enriquece tools com SKU default, imagem e categoria primária.
 * Usa `db.execute` (raw) porque subqueries escalares correlacionadas no
 * `db.select` builder não materializam (retornam null). Colunas aliasadas
 * com `AS "camelCase"` para contornar o snake_case do raw execute.
 */
export async function getToolCardMeta(
	toolIds: string[]
): Promise<Map<string, ToolCardMeta>> {
	const map = new Map<string, ToolCardMeta>();
	if (toolIds.length === 0) {
		return map;
	}
	const idList = sql.join(
		toolIds.map((id) => sql`${id}`),
		sql`, `
	);
	const result = await db.execute<{
		id: string;
		defaultSku: string | null;
		imageUrl: string | null;
		category: string | null;
	}>(sql`
		SELECT t.id,
			(SELECT sku FROM tool_variant WHERE tool_id = t.id AND is_default = true LIMIT 1) AS "defaultSku",
			(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS "imageUrl",
			(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS "category"
		FROM tool t
		WHERE t.id IN (${idList})
	`);
	for (const r of result.rows) {
		map.set(r.id, {
			defaultSku: r.defaultSku,
			imageUrl: r.imageUrl,
			category: r.category,
		});
	}
	return map;
}
