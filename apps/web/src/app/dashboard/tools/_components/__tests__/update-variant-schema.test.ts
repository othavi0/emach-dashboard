import { describe, expect, it } from "vitest";
import { updateVariantSchema } from "../tool-schema";

describe("updateVariantSchema.priceAmount", () => {
	it("aceita número", () => {
		const r = updateVariantSchema.safeParse({
			variantId: "v1",
			priceAmount: 12.5,
		});
		expect(r.success).toBe(true);
	});

	it("rejeita negativo", () => {
		const r = updateVariantSchema.safeParse({
			variantId: "v1",
			priceAmount: -1,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita string — o client normaliza antes de enviar", () => {
		const r = updateVariantSchema.safeParse({
			variantId: "v1",
			priceAmount: "12,50",
		});
		expect(r.success).toBe(false);
	});

	it("permite omitir o preço (edição de outro campo)", () => {
		const r = updateVariantSchema.safeParse({ variantId: "v1", sku: "ABC" });
		expect(r.success).toBe(true);
	});
});
