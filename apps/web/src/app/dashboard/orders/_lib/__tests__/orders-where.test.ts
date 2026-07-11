import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { BranchScope } from "@/lib/branch-scope";
import {
	ALL_ORDERS_TAB,
	CARRIER_NONE,
	ORDER_FLOW_TABS,
} from "../../status-meta";
import { buildOrdersListConditions, ordersTabSort } from "../orders-where";

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

	it("scope filial gera condição de filial + status + lateness exclude", () => {
		const conditions = buildOrdersListConditions({
			filters: {},
			scope: SCOPED_SCOPE,
			tabDef: PAID_TAB,
		});
		const { sql: rendered, params } = render(conditions);
		expect(rendered).toContain("o.branch_id IN");
		expect(rendered).toContain("o.status IN");
		expect(rendered).toContain("CASE WHEN o.status = 'preparing'");
		expect(rendered).toContain(
			"COALESCE(o.preparing_at, o.paid_at, o.created_at)"
		);
		expect(rendered).toContain(
			"ELSE COALESCE(o.paid_at, o.created_at) END > now() - make_interval(hours =>"
		);
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
