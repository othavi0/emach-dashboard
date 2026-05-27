import { describe, expect, it } from "vitest";
import {
	cancelOrderSchema,
	refundOrderSchema,
} from "../src/app/dashboard/orders/schema";

const VALID_ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const VALID_BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ITEM_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("refundOrderSchema", () => {
	it("aceita refund sem credit_stock", () => {
		const result = refundOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "Cliente desistiu da compra após pagamento",
			creditStock: false,
		});
		expect(result.success).toBe(true);
	});

	it("aceita refund com credit_stock e returnItems", () => {
		const result = refundOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "Cliente devolveu produto antes do envio",
			creditStock: true,
			returnItems: [{ orderItemId: VALID_ITEM_ID, branchId: VALID_BRANCH_ID }],
		});
		expect(result.success).toBe(true);
	});

	it("rejeita reason vazio", () => {
		const result = refundOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "",
			creditStock: false,
		});
		expect(result.success).toBe(false);
	});

	it("rejeita credit_stock=true sem returnItems", () => {
		const result = refundOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "Refund com estoque",
			creditStock: true,
			returnItems: [],
		});
		expect(result.success).toBe(false);
	});

	it("rejeita credit_stock=true sem branchId em algum item", () => {
		const result = refundOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "Refund com estoque",
			creditStock: true,
			returnItems: [{ orderItemId: VALID_ITEM_ID, branchId: "" }],
		});
		expect(result.success).toBe(false);
	});
});

describe("cancelOrderSchema", () => {
	it("aceita reason válido", () => {
		const result = cancelOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "Cliente desistiu antes de pagar",
		});
		expect(result.success).toBe(true);
	});

	it("rejeita reason vazio", () => {
		const result = cancelOrderSchema.safeParse({
			orderId: VALID_ORDER_ID,
			reason: "",
		});
		expect(result.success).toBe(false);
	});
});
