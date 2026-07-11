import { describe, expect, it } from "vitest";

import {
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	ORDER_FLOW_TABS,
} from "../status-meta";

describe("ORDER_FLOW_TABS (spec 2026-07-11)", () => {
	it("tem um chip por etapa, na ordem do fluxo", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"picked",
			"late",
			"shipped",
			"delivered",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em separação",
			"Separado",
			"Atrasados",
			"Enviados",
			"Entregues",
		]);
	});

	it("picked e preparing dividem o status preparing por sessão de picking", () => {
		const picked = ORDER_FLOW_TABS.find((t) => t.key === "picked");
		const preparing = ORDER_FLOW_TABS.find((t) => t.key === "preparing");
		expect(picked?.statuses).toEqual(["preparing"]);
		expect(picked?.picking).toBe("picked");
		expect(picked?.lateness).toBe("exclude");
		expect(preparing?.picking).toBe("not_picked");
	});

	it("aba computada 'late' cobre paid+preparing e é exclusiva", () => {
		const late = ORDER_FLOW_TABS.find((t) => t.key === "late");
		expect(late?.statuses).toEqual(["paid", "preparing"]);
		expect(late?.lateness).toBe("only");
		expect(ORDER_FLOW_TABS.find((t) => t.key === "paid")?.lateness).toBe(
			"exclude"
		);
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
