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

	it("rejeita fillFactorPct abaixo de 50", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 49,
			boxPaddingCm: 0,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita fillFactorPct acima de 100", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 101,
			boxPaddingCm: 0,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita fillFactorPct não inteiro", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 90.5,
			boxPaddingCm: 0,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita boxPaddingCm acima de 10", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 90,
			boxPaddingCm: 11,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita boxPaddingCm negativo", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
			fillFactorPct: 90,
			boxPaddingCm: -1,
		});
		expect(r.success).toBe(false);
	});
});
