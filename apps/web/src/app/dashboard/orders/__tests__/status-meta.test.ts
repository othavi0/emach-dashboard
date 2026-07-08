import { describe, expect, it } from "vitest";

import {
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	ORDER_FLOW_TABS,
} from "../status-meta";

describe("ORDER_FLOW_TABS (spec 2026-07-08)", () => {
	it("tem um chip por status do funil, na ordem do fluxo", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"shipped",
			"delivered",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em preparação",
			"Enviados",
			"Entregues",
		]);
	});

	it("cada aba de fluxo mapeia 1:1 pro próprio status", () => {
		for (const tab of ORDER_FLOW_TABS) {
			expect(tab.statuses).toEqual([tab.key]);
		}
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
