import { describe, expect, it } from "vitest";

import { orderBadgeSource } from "../_lib/display-state";

describe("orderBadgeSource (badge único, spec 2026-07-08)", () => {
	it("em preparing com sub-estado, o badge é o da separação", () => {
		expect(orderBadgeSource("preparing", "awaiting_picking")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picking_in_progress")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picking_exception")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picked")).toBe("fulfillment");
	});

	it("em preparing sem sub-estado calculado, cai no status", () => {
		expect(orderBadgeSource("preparing", null)).toBe("status");
		expect(orderBadgeSource("preparing", undefined)).toBe("status");
	});

	it("fora de preparing o status manda, mesmo com sub-estado presente", () => {
		expect(orderBadgeSource("paid", "awaiting_picking")).toBe("status");
		expect(orderBadgeSource("shipped", "picked")).toBe("status");
		expect(orderBadgeSource("delivered", null)).toBe("status");
	});

	it("na aba Atrasados o status manda, mesmo com sub-estado (spec 2026-07-13)", () => {
		expect(orderBadgeSource("preparing", "awaiting_picking", "late")).toBe(
			"status"
		);
		expect(orderBadgeSource("preparing", "picked", "late")).toBe("status");
		expect(orderBadgeSource("paid", null, "late")).toBe("status");
	});

	it("fora da aba Atrasados o comportamento não muda", () => {
		expect(orderBadgeSource("preparing", "picked", "preparing")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picked", "all")).toBe("fulfillment");
	});
});
