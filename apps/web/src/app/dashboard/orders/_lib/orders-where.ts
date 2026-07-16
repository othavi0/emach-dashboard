import type { OrderStatus } from "@emach/db/schema/orders";
import { type SQL, sql } from "drizzle-orm";
import { type BranchScope, orderBranchCondition } from "@/lib/branch-scope";
import type { OrderTabDef } from "../status-meta";
// CARRIER_NONE mora em status-meta.ts (client-safe) — este módulo importa
// drizzle-orm/branch-scope (server-tainted) e não pode ser importado por
// client component (ADR-0015). Consumers importam a constante direto de lá.
import {
	ALL_ORDERS_TAB,
	BRANCH_NONE,
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
	lateStatus?: LateStatusFilter;
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

// Sub-aba de Atrasados (pill): a etapa, não o status — "picked" é o recorte
// de `preparing` já separado, espelhando as abas do fluxo 1:1.
export type LateStatusFilter = "paid" | "preparing" | "picked";

const LATE_SUB_TAB_STATUS: Record<LateStatusFilter, OrderStatus> = {
	paid: "paid",
	preparing: "preparing",
	picked: "preparing",
};

// Sub-aba de Atrasados: estreita o par paid/preparing pra uma etapa só.
// Só tem efeito na tab computada (lateness "only") — nas demais é ignorado.
export function effectiveTabStatuses(
	tabDef: OrderTabDef,
	lateStatus?: LateStatusFilter
): readonly OrderStatus[] | null {
	if (tabDef.lateness === "only" && lateStatus) {
		const status = LATE_SUB_TAB_STATUS[lateStatus];
		return tabDef.statuses?.filter((s) => s === status) ?? null;
	}
	return tabDef.statuses;
}

// Divisão de `preparing` pela última sessão de picking. Vem da tab (abas "Em
// separação"/"Separado") ou, dentro do overlay de Atrasados, da pill escolhida
// — as duas superfícies compartilham a MESMA condição.
export function effectiveTabPicking(
	tabDef: OrderTabDef,
	lateStatus?: LateStatusFilter
): "picked" | "not_picked" | undefined {
	if (tabDef.picking) {
		return tabDef.picking;
	}
	if (tabDef.lateness !== "only" || !lateStatus) {
		return;
	}
	if (lateStatus === "picked") {
		return "picked";
	}
	return lateStatus === "preparing" ? "not_picked" : undefined;
}

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
	const statuses = effectiveTabStatuses(tabDef, filters.lateStatus);
	if (statuses && statuses.length > 0) {
		const placeholders = sql.join(
			statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (tabDef.lateness === "only") {
		conditions.push(sql`${fulfillmentAge} <= ${lateCutoff}`);
	}
	const picking = effectiveTabPicking(tabDef, filters.lateStatus);
	if (picking === "picked") {
		conditions.push(sql`${latestPickingStatus} = 'completed'`);
	}
	if (picking === "not_picked") {
		conditions.push(sql`${latestPickingStatus} IS DISTINCT FROM 'completed'`);
	}
	const query = filters.q?.trim();
	if (query) {
		conditions.push(
			sql`(o.number ILIKE ${`%${query}%`} OR c.name ILIKE ${`%${query}%`})`
		);
	}
	if (filters.branchId === BRANCH_NONE) {
		conditions.push(sql`o.branch_id IS NULL`);
	} else if (filters.branchId) {
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
	late_paid: number;
	late_picked: number;
	late_preparing: number;
	paid: number;
	payment_failed: number;
	pending_payment: number;
	picked: number;
	preparing: number;
	returned: number;
	shipped: number;
	// Pedidos na triagem (branch_id IS NULL) — overlay ao bucket de etapa (o
	// pedido é `paid`, então também soma em `paid`). Alimenta a opção "Na
	// triagem" do filtro de Filial. Naturalmente 0 para quem não enxerga a
	// triagem (`user` sem includeUnassigned): a query já é branch-scoped.
	unassigned: number;
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
		late_paid: 0,
		late_preparing: 0,
		late_picked: 0,
		shipped: 0,
		delivered: 0,
		returned: 0,
		canceled: 0,
		unassigned: 0,
	};
}

// Pura: agrega linhas status×is_late×is_picked nos buckets de tab. Os dois
// eixos são ORTOGONAIS e somam em paralelo:
//   · etapa — `paid` / `preparing` (não separado) / `picked` (separado), um
//     bucket por pedido, incluindo os atrasados;
//   · atraso — overlay (spec 2026-07-13): o atrasado soma TAMBÉM em `late` e no
//     sub-bucket da etapa (`late_paid`/`late_preparing`/`late_picked`), que
//     alimentam as pills. O mesmo pedido conta nos dois lugares — por isso os
//     `+=` (há uma linha por combinação status×is_late×is_picked).
export function foldTabCounts(
	rows: {
		count: number;
		is_late: boolean;
		is_picked: boolean;
		// Opcional: a função pura tolera linhas sem a flag (a única fonte real é a
		// query de counts em data.ts, que sempre a fornece). Ausente = não conta.
		is_unassigned?: boolean;
		status: OrderStatus;
	}[]
): OrderTabCounts {
	const counts = emptyTabCounts();
	for (const row of rows) {
		counts.all_count += row.count;
		// Overlay ortogonal: soma antes de qualquer `continue` de etapa, pois um
		// pedido na triagem também conta no bucket da própria etapa (`paid`).
		if (row.is_unassigned) {
			counts.unassigned += row.count;
		}
		if (row.is_late && (row.status === "paid" || row.status === "preparing")) {
			counts.late += row.count;
			if (row.status === "paid") {
				counts.late_paid += row.count;
			} else if (row.is_picked) {
				counts.late_picked += row.count;
			} else {
				counts.late_preparing += row.count;
			}
		}
		// Etapa: `picked` é o recorte de preparing já separado — nunca soma
		// também em `preparing` (as duas abas são exclusivas entre si).
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
