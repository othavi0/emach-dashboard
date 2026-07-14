import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { BranchScope } from "@/lib/branch-scope";
import {
	ALL_ORDERS_TAB,
	CARRIER_NONE,
	ORDER_FLOW_TABS,
} from "../../status-meta";
import {
	buildOrdersListConditions,
	effectiveTabPicking,
	effectiveTabStatuses,
	emptyTabCounts,
	foldTabCounts,
	ordersTabSort,
} from "../orders-where";

const dialect = new PgDialect();

function render(conditions: ReturnType<typeof buildOrdersListConditions>) {
	return dialect.sqlToQuery(sql.join(conditions, sql` AND `));
}

const ALL_SCOPE: BranchScope = { kind: "all" };
const SCOPED_SCOPE: BranchScope = {
	kind: "scoped",
	branchIds: ["branch-1", "branch-2"],
	includeUnassigned: false,
};

const PAID_TAB = ORDER_FLOW_TABS.find((t) => t.key === "paid");
if (!PAID_TAB) {
	throw new Error("tab 'paid' não encontrada em ORDER_FLOW_TABS");
}
const LATE_TAB = ORDER_FLOW_TABS.find((t) => t.key === "late");
if (!LATE_TAB) {
	throw new Error("tab 'late' não encontrada em ORDER_FLOW_TABS");
}
const PREPARING_TAB = ORDER_FLOW_TABS.find((t) => t.key === "preparing");
if (!PREPARING_TAB) {
	throw new Error("tab 'preparing' não encontrada em ORDER_FLOW_TABS");
}
const PICKED_TAB = ORDER_FLOW_TABS.find((t) => t.key === "picked");
if (!PICKED_TAB) {
	throw new Error("tab 'picked' não encontrada em ORDER_FLOW_TABS");
}

describe("ordersTabSort", () => {
	it("FIFO por paid_at nas filas de expedição", () => {
		expect(ordersTabSort("paid")).toBe("paidAtAsc");
		expect(ordersTabSort("preparing")).toBe("paidAtAsc");
		expect(ordersTabSort("late")).toBe("paidAtAsc");
	});
	it("mais recente primeiro no resto", () => {
		expect(ordersTabSort("all")).toBe("newest");
		expect(ordersTabSort("shipped")).toBe("newest");
		expect(ordersTabSort("canceled")).toBe("newest");
	});
	it("picked pagina FIFO como as demais filas de expedição", () => {
		expect(ordersTabSort("picked")).toBe("paidAtAsc");
		expect(ordersTabSort("shipped")).toBe("newest");
	});
});

describe("buildOrdersListConditions", () => {
	it("super_admin (scope all) não filtra por filial", () => {
		const conditions = buildOrdersListConditions({
			filters: {},
			scope: ALL_SCOPE,
			tabDef: PAID_TAB,
		});
		const { sql: rendered } = render(conditions);
		expect(rendered).not.toContain("branch_id");
	});

	it("scope filial gera condição de filial + status, sem lateness (overlay)", () => {
		const conditions = buildOrdersListConditions({
			filters: {},
			scope: SCOPED_SCOPE,
			tabDef: PAID_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.branch_id IN");
		expect(rendered).toContain("o.status IN");
		// Overlay: a aba da etapa não carrega condição de atraso nenhuma.
		expect(rendered).not.toContain("COALESCE(o.paid_at,");
		expect(params).toEqual(
			expect.arrayContaining(["branch-1", "branch-2", "paid"])
		);
	});

	it("tab 'late' filtra lateness only (<=)", () => {
		const conditions = buildOrdersListConditions({
			filters: {},
			scope: ALL_SCOPE,
			tabDef: LATE_TAB,
		});
		const { sql: rendered } = render(conditions);
		expect(rendered).toContain("CASE WHEN o.status = 'preparing'");
		expect(rendered).toContain(
			"ELSE COALESCE(o.paid_at, o.created_at) END <= now() - make_interval(hours =>"
		);
	});

	it("tab 'late' com lateStatus estreita status sem perder a condição de lateness", () => {
		const conditions = buildOrdersListConditions({
			filters: { lateStatus: "paid" },
			scope: ALL_SCOPE,
			tabDef: LATE_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.status IN");
		// Relógio por etapa (spec 2026-07-11) — a pill estreita o status, não a régua.
		expect(rendered).toContain(
			"ELSE COALESCE(o.paid_at, o.created_at) END <= now() - make_interval(hours =>"
		);
		expect(params).toContain("paid");
		expect(params).not.toContain("preparing");
	});

	it("tab 'Todos' (statuses null) não filtra por status", () => {
		const conditions = buildOrdersListConditions({
			filters: {},
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered } = render(conditions);
		expect(rendered).not.toContain("o.status IN");
	});

	it("q busca por número OU nome do cliente, já trimado", () => {
		const conditions = buildOrdersListConditions({
			filters: { q: "  1234  " },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.number ILIKE");
		expect(rendered).toContain("c.name ILIKE");
		expect(params).toContain("%1234%");
	});

	it("carrier CARRIER_NONE gera IS NULL", () => {
		const conditions = buildOrdersListConditions({
			filters: { carrier: CARRIER_NONE },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered } = render(conditions);
		expect(rendered).toContain("o.shipping_method IS NULL");
	});

	it("carrier com valor gera igualdade", () => {
		const conditions = buildOrdersListConditions({
			filters: { carrier: "correios" },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.shipping_method =");
		expect(params).toContain("correios");
	});

	it("toolId gera EXISTS em order_item", () => {
		const conditions = buildOrdersListConditions({
			filters: { toolId: "tool-1" },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("EXISTS (SELECT 1 FROM order_item oi_f");
		expect(params).toContain("tool-1");
	});

	it("from/to geram range em created_at (to exclusivo, +1 dia)", () => {
		const conditions = buildOrdersListConditions({
			filters: { from: "2026-07-01", to: "2026-07-10" },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.created_at >=");
		expect(rendered).toContain("o.created_at <");
		expect(rendered).toContain("INTERVAL '1 day'");
		expect(params).toEqual(
			expect.arrayContaining(["2026-07-01", "2026-07-10"])
		);
	});

	it("branchId explícito filtra além do scope", () => {
		const conditions = buildOrdersListConditions({
			filters: { branchId: "branch-9" },
			scope: ALL_SCOPE,
			tabDef: ALL_ORDERS_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.branch_id =");
		expect(params).toContain("branch-9");
	});
});

describe("foldTabCounts (etapa × overlay de atraso)", () => {
	it("atrasado soma no bucket da própria etapa E em late (spec 2026-07-13)", () => {
		const counts = foldTabCounts([
			{ count: 3, is_late: false, is_picked: false, status: "paid" },
			{ count: 2, is_late: true, is_picked: false, status: "paid" },
			{ count: 1, is_late: true, is_picked: false, status: "preparing" },
			{ count: 4, is_late: false, is_picked: false, status: "shipped" },
		]);
		expect(counts.paid).toBe(5);
		expect(counts.preparing).toBe(1);
		expect(counts.late).toBe(3);
		expect(counts.late_paid).toBe(2);
		expect(counts.late_preparing).toBe(1);
		expect(counts.all_count).toBe(10);
	});

	it("is_picked divide preparing: Separado nunca soma em Em separação", () => {
		const counts = foldTabCounts([
			{ count: 6, is_late: false, is_picked: false, status: "preparing" },
			{ count: 2, is_late: false, is_picked: true, status: "preparing" },
		]);
		expect(counts.preparing).toBe(6);
		expect(counts.picked).toBe(2);
		expect(counts.all_count).toBe(8);
	});

	it("preparing atrasado cai na pill da etapa certa (late_picked × late_preparing)", () => {
		const counts = foldTabCounts([
			{ count: 1, is_late: true, is_picked: false, status: "preparing" },
			{ count: 4, is_late: true, is_picked: true, status: "preparing" },
		]);
		// Etapa: cada um no seu bucket, incluindo os atrasados.
		expect(counts.preparing).toBe(1);
		expect(counts.picked).toBe(4);
		// Overlay: os cinco contam em late, divididos pelas pills.
		expect(counts.late).toBe(5);
		expect(counts.late_preparing).toBe(1);
		expect(counts.late_picked).toBe(4);
		expect(counts.late_paid).toBe(0);
		// As pills somam exatamente o total de late.
		expect(counts.late_paid + counts.late_preparing + counts.late_picked).toBe(
			counts.late
		);
	});

	it("all_count não dobra: cada pedido conta uma vez", () => {
		const counts = foldTabCounts([
			{ count: 7, is_late: true, is_picked: false, status: "paid" },
		]);
		expect(counts.all_count).toBe(7);
		expect(counts.paid).toBe(7);
		expect(counts.late).toBe(7);
	});

	it("emptyTabCounts expõe as chaves das sub-abas zeradas", () => {
		const counts = emptyTabCounts();
		expect(counts.late_paid).toBe(0);
		expect(counts.late_preparing).toBe(0);
		expect(counts.late_picked).toBe(0);
		expect(counts.picked).toBe(0);
	});
});

describe("effectiveTabStatuses (sub-aba lateStatus)", () => {
	it("na aba late, lateStatus estreita para um único status", () => {
		expect(effectiveTabStatuses(LATE_TAB, "paid")).toEqual(["paid"]);
		expect(effectiveTabStatuses(LATE_TAB, "preparing")).toEqual(["preparing"]);
	});

	it("sem lateStatus, mantém os statuses da def", () => {
		expect(effectiveTabStatuses(LATE_TAB, undefined)).toEqual([
			"paid",
			"preparing",
		]);
	});

	it("a pill 'picked' é o recorte de preparing (não é status próprio)", () => {
		expect(effectiveTabStatuses(LATE_TAB, "picked")).toEqual(["preparing"]);
	});

	it("fora da aba late, lateStatus é ignorado", () => {
		expect(effectiveTabStatuses(PAID_TAB, "preparing")).toEqual(["paid"]);
	});
});

describe("effectiveTabPicking (etapa dentro do overlay de Atrasados)", () => {
	it("a tab manda quando ela própria divide preparing", () => {
		expect(effectiveTabPicking(PICKED_TAB, undefined)).toBe("picked");
		expect(effectiveTabPicking(PREPARING_TAB, undefined)).toBe("not_picked");
	});

	it("na aba late, a pill escolhe a metade de preparing", () => {
		expect(effectiveTabPicking(LATE_TAB, "picked")).toBe("picked");
		expect(effectiveTabPicking(LATE_TAB, "preparing")).toBe("not_picked");
	});

	it("pill 'paid' e ausência de pill não dividem picking", () => {
		expect(effectiveTabPicking(LATE_TAB, "paid")).toBeUndefined();
		expect(effectiveTabPicking(LATE_TAB, undefined)).toBeUndefined();
	});
});

describe("buildOrdersListConditions × picking", () => {
	it("aba Separado exige última sessão de picking concluída", () => {
		const { sql: rendered } = render(
			buildOrdersListConditions({
				filters: {},
				scope: ALL_SCOPE,
				tabDef: PICKED_TAB,
			})
		);
		expect(rendered).toContain("FROM order_picking op");
		expect(rendered).toContain("= 'completed'");
	});

	it("aba Em separação exige o inverso (IS DISTINCT FROM — sem sessão conta)", () => {
		const { sql: rendered } = render(
			buildOrdersListConditions({
				filters: {},
				scope: ALL_SCOPE,
				tabDef: PREPARING_TAB,
			})
		);
		expect(rendered).toContain("IS DISTINCT FROM 'completed'");
	});

	it("pill Separado dentro de Atrasados: lateness only + picking picked", () => {
		const { sql: rendered } = render(
			buildOrdersListConditions({
				filters: { lateStatus: "picked" },
				scope: ALL_SCOPE,
				tabDef: LATE_TAB,
			})
		);
		expect(rendered).toContain("<= now() - make_interval(hours =>");
		expect(rendered).toContain("= 'completed'");
		expect(rendered).not.toContain("IS DISTINCT FROM");
	});
});
