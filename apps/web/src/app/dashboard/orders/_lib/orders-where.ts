import type { OrderStatus } from "@emach/db/schema/orders";
import { type SQL, sql } from "drizzle-orm";
import { type BranchScope, orderBranchCondition } from "@/lib/branch-scope";
import type { OrderTabDef } from "../status-meta";
// CARRIER_NONE mora em status-meta.ts (client-safe) — este módulo importa
// drizzle-orm/branch-scope (server-tainted) e não pode ser importado por
// client component (ADR-0015). Consumers importam a constante direto de lá.
import { CARRIER_NONE } from "../status-meta";
import { LATE_TAB_HOURS } from "./lateness";

const FIFO_TABS = new Set(["paid", "preparing", "late"]);

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

// Relógio de atraso: COALESCE(paid_at, created_at) — espelha latenessOf().
const fulfillmentAge = sql`COALESCE(o.paid_at, o.created_at)`;
const lateCutoff = sql`now() - make_interval(hours => ${LATE_TAB_HOURS})`;

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
		late: 0,
		shipped: 0,
		delivered: 0,
		returned: 0,
		canceled: 0,
	};
}

// Pura: agrega linhas status×is_late (uma por combinação existente) nos buckets
// de tab. `late` soma paid/preparing atrasados; `paid`/`preparing` continuam
// só os NÃO atrasados (a tab "late" é exclusiva das duas — ver status-meta).
export function foldTabCounts(
	rows: { count: number; is_late: boolean; status: OrderStatus }[]
): OrderTabCounts {
	const counts = emptyTabCounts();
	for (const row of rows) {
		counts.all_count += row.count;
		if (row.is_late && (row.status === "paid" || row.status === "preparing")) {
			counts.late += row.count;
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
				counts[row.status] = row.count;
				break;
			default:
				break;
		}
	}
	return counts;
}
