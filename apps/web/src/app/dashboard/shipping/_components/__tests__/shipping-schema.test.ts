import { describe, expect, it } from "vitest";
import { shippingSettingsSchema } from "../shipping-schema";

describe("shippingSettingsSchema", () => {
	it("aceita política none sem origem", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 90,
			boxPaddingCm: 0,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.originBranchId).toBeUndefined();
		}
	});

	it("rejeita política inválida", () => {
		const r = shippingSettingsSchema.safeParse({
			insurancePolicy: "full",
			insuranceCapAmount: 3000,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita teto negativo", () => {
		const r = shippingSettingsSchema.safeParse({
			insurancePolicy: "cart_value",
			insuranceCapAmount: -1,
		});
		expect(r.success).toBe(false);
	});
});
