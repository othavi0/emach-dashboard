import { describe, expect, it } from "vitest";

import { ordersListFiltersSchema, updateOrderStatusSchema } from "../schema";

describe("ordersListFiltersSchema — lateStatus", () => {
	it("aceita paid e preparing", () => {
		expect(
			ordersListFiltersSchema.parse({ tab: "late", lateStatus: "paid" })
				.lateStatus
		).toBe("paid");
		expect(
			ordersListFiltersSchema.parse({ lateStatus: "preparing" }).lateStatus
		).toBe("preparing");
	});

	it("rejeita valor fora do enum (página cai no default)", () => {
		expect(
			ordersListFiltersSchema.safeParse({ lateStatus: "shipped" }).success
		).toBe(false);
	});

	it("é opcional", () => {
		expect(ordersListFiltersSchema.parse({}).lateStatus).toBeUndefined();
	});
});

describe("updateOrderStatusSchema — trackingCode no envio (spec D3)", () => {
	const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

	it("shipped SEM trackingCode é válido — código chega depois do envio", () => {
		const result = updateOrderStatusSchema.safeParse({
			orderId: ORDER_ID,
			toStatus: "shipped",
		});
		expect(result.success).toBe(true);
	});

	it("shipped COM trackingCode continua válido", () => {
		const result = updateOrderStatusSchema.safeParse({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});
		expect(result.success).toBe(true);
	});

	it("canceled ainda exige reason (refine não regrediu)", () => {
		const result = updateOrderStatusSchema.safeParse({
			orderId: ORDER_ID,
			toStatus: "canceled",
		});
		expect(result.success).toBe(false);
	});
});
