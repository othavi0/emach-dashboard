import { describe, expect, it } from "vitest";
import { lastOrderHint } from "./customer-display";

const LAST_ORDER_AT = new Date("2026-10-01T12:00:00Z");

describe("lastOrderHint", () => {
	it.each([
		["pending_payment", "Aguardando pagamento"],
		["payment_failed", "Pagamento falhou"],
		["paid", "Pago"],
		["preparing", "Em separação"],
		["shipped", "Enviado"],
		["delivered", "Entregue"],
		["returned", "Devolvido"],
		["canceled", "Cancelado"],
		["refunded", "Reembolsado"],
	] as const)("mostra %s como %s", (status, label) => {
		expect(
			lastOrderHint({ lastOrderAt: LAST_ORDER_AT, lastOrderStatus: status })
		).toBe(label);
	});

	it("diz que o cliente não tem pedidos", () => {
		expect(lastOrderHint({ lastOrderAt: null, lastOrderStatus: null })).toBe(
			"Sem pedidos"
		);
	});
});
