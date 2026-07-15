import { describe, expect, it } from "vitest";

import {
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	LATE_SUB_TABS,
	ORDER_FLOW_TABS,
} from "../status-meta";

describe("ORDER_FLOW_TABS (spec 2026-07-11; overlay 'late' spec 2026-07-13)", () => {
	it("tem um chip por etapa, na ordem do fluxo; 'late' fecha a fileira", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"picked",
			"shipped",
			"delivered",
			"late",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em separação",
			"Pronto para enviar",
			"Enviados",
			"Entregues",
			"Atrasados",
		]);
	});

	it("picked e preparing dividem o status preparing por sessão de picking", () => {
		const picked = ORDER_FLOW_TABS.find((t) => t.key === "picked");
		const preparing = ORDER_FLOW_TABS.find((t) => t.key === "preparing");
		expect(picked?.statuses).toEqual(["preparing"]);
		expect(picked?.picking).toBe("picked");
		expect(preparing?.picking).toBe("not_picked");
	});

	it("aba computada 'late' cobre paid+preparing como OVERLAY (spec 2026-07-13)", () => {
		const late = ORDER_FLOW_TABS.find((t) => t.key === "late");
		expect(late?.statuses).toEqual(["paid", "preparing"]);
		expect(late?.lateness).toBe("only");
		// Overlay: pedido atrasado NÃO some das abas da própria etapa — nem das
		// duas metades de preparing (Em separação / Separado).
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "paid")?.lateness
		).toBeUndefined();
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "preparing")?.lateness
		).toBeUndefined();
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "picked")?.lateness
		).toBeUndefined();
	});

	it("sub-abas de Atrasados espelham as etapas 1:1", () => {
		expect(LATE_SUB_TABS.map((t) => t.key)).toEqual([
			"all",
			"paid",
			"preparing",
			"picked",
		]);
		expect(LATE_SUB_TABS.map((t) => t.label)).toEqual([
			"Todos",
			"Pagos",
			"Em separação",
			"Pronto para enviar",
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
