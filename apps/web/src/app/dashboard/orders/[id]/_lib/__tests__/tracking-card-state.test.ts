import { describe, expect, it } from "vitest";
import { showTrackingCard } from "../tracking-card-state";

describe("showTrackingCard", () => {
	it("aparece pós-envio", () => {
		expect(showTrackingCard("shipped")).toBe(true);
		expect(showTrackingCard("delivered")).toBe(true);
	});
	it("não aparece antes do envio nem em exceção", () => {
		for (const s of [
			"pending_payment",
			"paid",
			"preparing",
			"canceled",
			"refunded",
			"returned",
			"payment_failed",
		] as const) {
			expect(showTrackingCard(s)).toBe(false);
		}
	});
});
