import { describe, expect, it } from "vitest";

import { fulfillmentBadgeLabel } from "../fulfillment-meta";

describe("fulfillmentBadgeLabel (spec 2026-07-11, mockup B)", () => {
	it("compõe estado + nome nas sessões relevantes", () => {
		expect(
			fulfillmentBadgeLabel("picking_in_progress", "Othavio Quiliao")
		).toBe("Separando · Othavio Quiliao");
		expect(fulfillmentBadgeLabel("picked", "Othavio Quiliao")).toBe(
			"Pronto para enviar · Othavio Quiliao"
		);
	});

	it("exceção usa a forma curta no composto", () => {
		expect(fulfillmentBadgeLabel("picking_exception", "Othavio Quiliao")).toBe(
			"Exceção · Othavio Quiliao"
		);
	});

	it("a separar nunca mostra nome", () => {
		expect(fulfillmentBadgeLabel("awaiting_picking", "Othavio Quiliao")).toBe(
			"A separar"
		);
	});

	it("sem pickerName cai no label simples", () => {
		expect(fulfillmentBadgeLabel("picked", null)).toBe("Pronto para enviar");
	});
});
