import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { orderStatusEnum } from "../schema/orders";
import {
	ACTIVE_ORDER_STATUSES,
	REVENUE_ORDER_STATUSES,
	sqlStatusList,
} from "./order-status-groups";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

/** Ordem canônica do ciclo de vida (não a ordem de ADD VALUE do enum). */
export const ORDER_STATUS_FUNNEL = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
	"payment_failed",
	"returned",
] as const;

/** União dos status cobertos pelo funil. */
export type OrderFunnelStatus = (typeof ORDER_STATUS_FUNNEL)[number];

// Drift guard (type-level): se um status novo do enum não entrar no funil,
// `Exclude` deixa de ser `never` e este alias quebra a compilação.
type AssertNever<T extends never> = T;
export type OrderFunnelCoversEnum = AssertNever<
	Exclude<(typeof orderStatusEnum.enumValues)[number], OrderFunnelStatus>
>;

export function sortByFunnel<T extends { status: string }>(rows: T[]): T[] {
	const pos = (s: string) => {
		const i = ORDER_STATUS_FUNNEL.indexOf(
			s as (typeof ORDER_STATUS_FUNNEL)[number]
		);
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	return [...rows].sort((a, b) => pos(a.status) - pos(b.status));
}

/**
 * Converte 'YYYY-MM-DD' (string crua de coluna `::date` via `db.execute`) em
 * Date à meia-noite LOCAL. `new Date('YYYY-MM-DD')` parseia como meia-noite UTC,
 * o que faz `format()` exibir o dia anterior em fusos negativos (ex: UTC-3).
 */
export function localDate(value: string): Date {
	return new Date(`${value}T00:00:00`);
}

/** Média móvel trailing (janela cresce até `window`). */
export function movingAverage(values: number[], window: number): number[] {
	return values.map((_, i) => {
		const start = Math.max(0, i - window + 1);
		const slice = values.slice(start, i + 1);
		return slice.reduce((a, b) => a + b, 0) / slice.length;
	});
}

// ---------------------------------------------------------------------------
// Exported result types
// ---------------------------------------------------------------------------

export interface DashboardKpis {
	activeClients: number;
	activeOrders: number;
	activePromotions: number;
	oldestPendingReviewHours: number | null;
	pendingReviews: number;
	promotionsExpiring7d: number;
	revenueToday: number;
	stockOutages: number;
}

export interface RevenuePoint {
	day: Date;
	movingAvg: number;
	revenue: number;
}

export interface FunnelRow {
	count: number;
	status: string;
}

export interface RatingRow {
	count: number;
	rating: number;
}

export interface ReorderRow {
	branchName: string;
	deficit: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolName: string;
}

export interface StatusSlice {
	count: number;
	key: string;
}

export interface NewClientPoint {
	count: number;
	week: Date;
}

export interface StockFlowPoint {
	entradas: number;
	saidas: number;
	week: Date;
}

export interface BranchOption {
	id: string;
	name: string;
}

// ---------------------------------------------------------------------------
// 1. getDashboardKpis — 1 query consolidada
// ---------------------------------------------------------------------------

export async function getDashboardKpis(
	db: AnyDb,
	branchId: string | null
): Promise<DashboardKpis> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const stockBranchFilter = branchId
		? sql`AND sl.branch_id = ${branchId}`
		: sql``;
	const res = await db.execute<{
		revenue_today: string;
		active_orders: number;
		pending_reviews: number;
		oldest_pending_review_hours: string | null;
		stock_outages: number;
		active_clients: number;
		active_promotions: number;
		promotions_expiring_7d: number;
	}>(sql`
		SELECT
			(SELECT COALESCE(SUM(o.total_amount), 0) FROM "order" o
				WHERE o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
				AND o.created_at >= date_trunc('day', now()) ${branchFilter}) AS revenue_today,
			(SELECT COUNT(*)::int FROM "order" o
				WHERE o.status IN (${sqlStatusList(ACTIVE_ORDER_STATUSES)}) ${branchFilter}) AS active_orders,
			(SELECT COUNT(*)::int FROM review WHERE status = 'pending') AS pending_reviews,
			(SELECT ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 3600)::text
				FROM review WHERE status = 'pending') AS oldest_pending_review_hours,
			(SELECT COUNT(*)::int FROM stock_level sl WHERE sl.quantity = 0 ${stockBranchFilter}) AS stock_outages,
			(SELECT COUNT(*)::int FROM client WHERE status = 'active') AS active_clients,
			(SELECT COUNT(*)::int FROM promotion WHERE active = true
				AND (starts_at IS NULL OR starts_at <= now())
				AND (ends_at IS NULL OR ends_at > now())) AS active_promotions,
			(SELECT COUNT(*)::int FROM promotion WHERE active = true
				AND ends_at IS NOT NULL AND ends_at BETWEEN now() AND now() + INTERVAL '7 days') AS promotions_expiring_7d
	`);
	const r = res.rows[0];
	if (!r) {
		throw new Error("getDashboardKpis: 0 linhas");
	}
	return {
		revenueToday: Number(r.revenue_today),
		activeOrders: r.active_orders,
		pendingReviews: r.pending_reviews,
		oldestPendingReviewHours:
			r.oldest_pending_review_hours === null
				? null
				: Number(r.oldest_pending_review_hours),
		stockOutages: r.stock_outages,
		activeClients: r.active_clients,
		activePromotions: r.active_promotions,
		promotionsExpiring7d: r.promotions_expiring_7d,
	};
}

// ---------------------------------------------------------------------------
// 2. getDailyRevenue — série 30d com média móvel 7d
// ---------------------------------------------------------------------------

export async function getDailyRevenue(
	db: AnyDb,
	branchId: string | null
): Promise<RevenuePoint[]> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ day: string; revenue: string }>(sql`
		SELECT date_trunc('day', o.created_at)::date AS day,
			COALESCE(SUM(o.total_amount), 0) AS revenue
		FROM "order" o
		WHERE o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
			AND o.created_at >= now() - INTERVAL '30 days' ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	const revenues = res.rows.map((r) => Number(r.revenue));
	const ma = movingAverage(revenues, 7);
	return res.rows.map((r, i) => ({
		day: localDate(r.day),
		revenue: revenues[i] as number,
		movingAvg: Number(ma[i]?.toFixed(2) ?? 0),
	}));
}

// ---------------------------------------------------------------------------
// 3. getOrderFunnel — distribuição de status últimos 30d
// ---------------------------------------------------------------------------

export async function getOrderFunnel(
	db: AnyDb,
	branchId: string | null
): Promise<FunnelRow[]> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ status: string; count: number }>(sql`
		SELECT o.status, COUNT(*)::int AS count FROM "order" o
		WHERE o.created_at >= now() - INTERVAL '30 days' ${branchFilter}
		GROUP BY o.status
	`);
	return sortByFunnel(res.rows);
}

// ---------------------------------------------------------------------------
// 4. getRatingDistribution — contagem por nota (aprovadas, 30d)
// ---------------------------------------------------------------------------

export async function getRatingDistribution(db: AnyDb): Promise<RatingRow[]> {
	const res = await db.execute<{ rating: number; count: number }>(sql`
		SELECT rating, COUNT(*)::int AS count FROM review
		WHERE status = 'approved' AND created_at >= now() - INTERVAL '30 days'
		GROUP BY rating ORDER BY rating ASC
	`);
	return res.rows;
}

// ---------------------------------------------------------------------------
// 5. getReorderTable — itens abaixo do ponto de reposição
// ---------------------------------------------------------------------------

export async function getReorderTable(
	db: AnyDb,
	branchId: string | null
): Promise<ReorderRow[]> {
	const branchFilter = branchId ? sql`AND sl.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{
		branch_name: string;
		tool_name: string;
		sku: string;
		quantity: number;
		reorder_point: number;
		deficit: number;
	}>(sql`
		SELECT b.name AS branch_name, t.name AS tool_name, tv.sku,
			sl.quantity, sl.reorder_point,
			(sl.reorder_point - sl.quantity) AS deficit
		FROM stock_level sl
		JOIN branch b ON b.id = sl.branch_id
		JOIN tool_variant tv ON tv.id = sl.variant_id
		JOIN tool t ON t.id = tv.tool_id
		WHERE sl.quantity <= sl.reorder_point
			AND t.status IN ('active')
			AND b.status = 'active' ${branchFilter}
		ORDER BY deficit DESC LIMIT 50
	`);
	return res.rows.map((r) => ({
		branchName: r.branch_name,
		toolName: r.tool_name,
		sku: r.sku,
		quantity: r.quantity,
		reorderPoint: r.reorder_point,
		deficit: r.deficit,
	}));
}

// ---------------------------------------------------------------------------
// 6. getToolStatusBreakdown — donut de status do catálogo
// ---------------------------------------------------------------------------

export async function getToolStatusBreakdown(
	db: AnyDb
): Promise<StatusSlice[]> {
	const res = await db.execute<{ status: string; count: number }>(sql`
		SELECT status, COUNT(*)::int AS count FROM tool
		GROUP BY status ORDER BY count DESC
	`);
	return res.rows.map((r) => ({ key: r.status, count: r.count }));
}

// ---------------------------------------------------------------------------
// 7. getNewClients — novos clientes por semana (90d)
// ---------------------------------------------------------------------------

export async function getNewClients(db: AnyDb): Promise<NewClientPoint[]> {
	const res = await db.execute<{ week: string; count: number }>(sql`
		SELECT date_trunc('week', created_at)::date AS week,
			COUNT(*)::int AS count
		FROM client
		WHERE created_at >= now() - INTERVAL '90 days'
		GROUP BY 1 ORDER BY 1 ASC
	`);
	return res.rows.map((r) => ({ week: localDate(r.week), count: r.count }));
}

// ---------------------------------------------------------------------------
// 8. getPromotionStatusBreakdown — donut de promoções por estado
// ---------------------------------------------------------------------------

export async function getPromotionStatusBreakdown(
	db: AnyDb
): Promise<StatusSlice[]> {
	const res = await db.execute<{ key: string; count: number }>(sql`
		SELECT CASE
			WHEN active = false THEN 'inativa'
			WHEN starts_at IS NOT NULL AND starts_at > now() THEN 'agendada'
			WHEN ends_at IS NOT NULL AND ends_at <= now() THEN 'expirada'
			ELSE 'ativa' END AS key,
			COUNT(*)::int AS count
		FROM promotion GROUP BY 1
	`);
	return res.rows;
}

// ---------------------------------------------------------------------------
// 9. getStockFlow — entradas e saídas por semana (12 semanas)
// ---------------------------------------------------------------------------

export async function getStockFlow(
	db: AnyDb,
	branchId: string | null
): Promise<StockFlowPoint[]> {
	const branchFilter = branchId ? sql`AND sm.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{
		week: string;
		entradas: number;
		saidas: number;
	}>(sql`
		SELECT date_trunc('week', sm.created_at)::date AS week,
			COALESCE(SUM(sm.delta) FILTER (WHERE sm.delta > 0), 0)::int AS entradas,
			COALESCE(ABS(SUM(sm.delta) FILTER (WHERE sm.delta < 0)), 0)::int AS saidas
		FROM stock_movement sm
		WHERE sm.created_at >= now() - INTERVAL '12 weeks' ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	return res.rows.map((r) => ({
		week: localDate(r.week),
		entradas: r.entradas,
		saidas: r.saidas,
	}));
}

// ---------------------------------------------------------------------------
// 10. getBranchOptions — lista de filiais para o selector
// ---------------------------------------------------------------------------

export async function getBranchOptions(db: AnyDb): Promise<BranchOption[]> {
	const res = await db.execute<{ id: string; name: string }>(sql`
		SELECT id, name FROM branch WHERE status = 'active' ORDER BY name ASC
	`);
	return res.rows;
}
