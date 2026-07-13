import { describe, expect, it } from "vitest";

import {
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	LATE_SUB_TABS,
	ORDER_FLOW_TABS,
} from "../status-meta";

describe("ORDER_FLOW_TABS (spec 2026-07-08, tab 'late' spec 2026-07-10)", () => {
	it("tem um chip por status do funil; 'late' fecha a fileira", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"shipped",
			"delivered",
			"late",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em preparação",
			"Enviados",
			"Entregues",
			"Atrasados",
		]);
	});

	it("cada aba de fluxo comum mapeia 1:1 pro próprio status", () => {
		for (const tab of ORDER_FLOW_TABS) {
			if (tab.key === "late") {
				continue;
			}
			expect(tab.statuses).toEqual([tab.key]);
		}
	});

	it("aba computada 'late' cobre paid+preparing como OVERLAY (spec 2026-07-13)", () => {
		const late = ORDER_FLOW_TABS.find((t) => t.key === "late");
		expect(late?.statuses).toEqual(["paid", "preparing"]);
		expect(late?.lateness).toBe("only");
		// Overlay: pedido atrasado NÃO some das abas do próprio status.
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "paid")?.lateness
		).toBeUndefined();
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "preparing")?.lateness
		).toBeUndefined();
	});

	it("sub-abas de Atrasados: Todos, Pagos, Em preparação", () => {
		expect(LATE_SUB_TABS.map((t) => t.key)).toEqual([
			"all",
			"paid",
			"preparing",
		]);
		expect(LATE_SUB_TABS.map((t) => t.label)).toEqual([
			"Todos",
			"Pagos",
			"Em preparação",
		]);
	});

	it("default é a fila de entrada (Pago)", () => {
		expect(DEFAULT_ORDER_TAB).toBe("paid");
	});
});

describe("canonicalOrderTabKey", () => {
	it("resolve o deep-link legado to_prepare para paid", () => {
		expect(canonicalOrderTabKey("to_prepare")).toBe("paid");
	});

	it("passa chaves atuais adiante sem mexer", () => {
		expect(canonicalOrderTabKey("preparing")).toBe("preparing");
		expect(canonicalOrderTabKey("all")).toBe("all");
	});

	it("preserva undefined (sem ?tab na URL)", () => {
		expect(canonicalOrderTabKey(undefined)).toBeUndefined();
	});
});
