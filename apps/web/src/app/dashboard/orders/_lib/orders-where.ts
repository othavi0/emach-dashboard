import type { OrderStatus } from "@emach/db/schema/orders";
import { type SQL, sql } from "drizzle-orm";
import { type BranchScope, orderBranchCondition } from "@/lib/branch-scope";
import type { OrderTabDef } from "../status-meta";
// CARRIER_NONE mora em status-meta.ts (client-safe) — este módulo importa
// drizzle-orm/branch-scope (server-tainted) e não pode ser importado por
// client component (ADR-0015). Consumers importam a constante direto de lá.
import {
	ALL_ORDERS_TAB,
	CARRIER_NONE,
	canonicalOrderTabKey,
	ORDER_TABS,
} from "../status-meta";
import { LATE_TAB_HOURS } from "./lateness";

// Resolve a tab pela key (com alias legado, fallback pra "Todos") — fonte
// única consumida por fetchOrdersPage, resumo de produto e export CSV.
export function resolveTab(tab?: string) {
	const key = canonicalOrderTabKey(tab);
	return ORDER_TABS.find((item) => item.key === key) ?? ALL_ORDERS_TAB;
}

export function normalizeDateParam(value?: string): string | undefined {
	if (!value) {
		return;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

const FIFO_TABS = new Set(["paid", "preparing", "picked", "late"]);

// FIFO das filas de expedição pagina por COALESCE(paid_at, created_at) via a
// variante PaidAtAscCursor JÁ existente em @/lib/cursor — não criar sort novo.
export function ordersTabSort(tabKey: string): "paidAtAsc" | "newest" {
	return FIFO_TABS.has(tabKey) ? "paidAtAsc" : "newest";
}

// Builder ÚNICO do WHERE da listagem — consumido por fetchOrdersPage,
// export CSV e resumo de produto. Não importa session/headers (puro + sql).
export interface OrdersWhereFilters {
	branchId?: string;
	carrier?: string; // "__none__" = frete a combinar (IS NULL)
	from?: string;
	q?: string;
	to?: string;
	toolId?: string;
}

// Relógio de atraso por etapa (spec 2026-07-11): preparing conta da entrada
// na separação; paid do pagamento — espelha latenessOf().
const fulfillmentAge = sql`CASE WHEN o.status = 'preparing'
	THEN COALESCE(o.preparing_at, o.paid_at, o.created_at)
	ELSE COALESCE(o.paid_at, o.created_at) END`;
const lateCutoff = sql`now() - make_interval(hours => ${LATE_TAB_HOURS})`;

// Última sessão de picking do pedido (mesma semântica do LATERAL lp de
// data.ts: started_at DESC, id DESC). NULL (sem sessão) ≠ 'completed'.
const latestPickingStatus = sql`(
	SELECT op.status FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC, op.id DESC LIMIT 1
)`;

export function buildOrdersListConditions({
	filters,
	scope,
	tabDef,
}: {
	filters: OrdersWhereFilters;
	scope: BranchScope;
	tabDef: OrderTabDef;
}): SQL[] {
	const conditions: SQL[] = [];
	const branchCondition = orderBranchCondition(scope);
	if (branchCondition) {
		conditions.push(branchCondition);
	}
	if (tabDef.statuses) {
		const placeholders = sql.join(
			tabDef.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (tabDef.lateness === "only") {
		conditions.push(sql`${fulfillmentAge} <= ${lateCutoff}`);
	}
	if (tabDef.lateness === "exclude") {
		conditions.push(sql`${fulfillmentAge} > ${lateCutoff}`);
	}
	if (tabDef.picking === "picked") {
		conditions.push(sql`${latestPickingStatus} = 'completed'`);
	}
	if (tabDef.picking === "not_picked") {
		conditions.push(sql`${latestPickingStatus} IS DISTINCT FROM 'completed'`);
	}
	const query = filters.q?.trim();
	if (query) {
		conditions.push(
			sql`(o.number ILIKE ${`%${query}%`} OR c.name ILIKE ${`%${query}%`})`
		);
	}
	if (filters.branchId) {
		conditions.push(sql`o.branch_id = ${filters.branchId}`);
	}
	if (filters.carrier === CARRIER_NONE) {
		conditions.push(sql`o.shipping_method IS NULL`);
	} else if (filters.carrier) {
		conditions.push(sql`o.shipping_method = ${filters.carrier}`);
	}
	if (filters.toolId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM order_item oi_f WHERE oi_f.order_id = o.id AND oi_f.tool_id = ${filters.toolId})`
		);
	}
	if (filters.from) {
		conditions.push(sql`o.created_at >= ${filters.from}::date`);
	}
	if (filters.to) {
		conditions.push(
			sql`o.created_at < (${filters.to}::date + INTERVAL '1 day')`
		);
	}
	return conditions;
}

export interface OrderTabCounts {
	all_count: number;
	canceled: number;
	delivered: number;
	late: number;
	paid: number;
	payment_failed: number;
	pending_payment: number;
	picked: number;
	preparing: number;
	returned: number;
	shipped: number;
	[key: string]: number;
}

export function emptyTabCounts(): OrderTabCounts {
	return {
		all_count: 0,
		pending_payment: 0,
		payment_failed: 0,
		paid: 0,
		preparing: 0,
		picked: 0,
		late: 0,
		shipped: 0,
		delivered: 0,
		returned: 0,
		canceled: 0,
	};
}

// Pura: agrega linhas status×is_late×is_picked nos buckets de tab. `late`
// vence (exclusiva); dentro de preparing não-atrasado, is_picked separa a
// tab "Separado" da "Em separação".
export function foldTabCounts(
	rows: {
		count: number;
		is_late: boolean;
		is_picked: boolean;
		status: OrderStatus;
	}[]
): OrderTabCounts {
	const counts = emptyTabCounts();
	for (const row of rows) {
		counts.all_count += row.count;
		if (row.is_late && (row.status === "paid" || row.status === "preparing")) {
			counts.late += row.count;
			continue;
		}
		if (row.status === "preparing" && row.is_picked) {
			counts.picked += row.count;
			continue;
		}
		// `canceled`/`refunded` somam na mesma tab; os demais mapeiam 1:1. O
		// switch estreita row.status para o literal, então a indexação é type-safe.
		switch (row.status) {
			case "canceled":
			case "refunded":
				counts.canceled += row.count;
				break;
			case "pending_payment":
			case "payment_failed":
			case "paid":
			case "preparing":
			case "shipped":
			case "delivered":
			case "returned":
				counts[row.status] += row.count;
				break;
			default:
				break;
		}
	}
	return counts;
}
