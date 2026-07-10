import { type SQL, sql } from "drizzle-orm";

import { type BranchScope, orderBranchCondition } from "@/lib/branch-scope";
import type { OrderTabDef } from "../status-meta";
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

export const CARRIER_NONE = "__none__";

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
