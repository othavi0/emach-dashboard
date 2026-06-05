import { describe, expect, it } from "vitest";
import { promotionSchema } from "../promotion-schema";

const base = {
	title: "Promo",
	description: null,
	discountType: "percent",
	discountValue: 10,
	appliesToAll: false,
	active: true,
	startsAt: null,
	endsAt: null,
	toolIds: ["t1"],
};

describe("promotionSchema", () => {
	it("aceita promoção percent específica com 1 ferramenta", () => {
		expect(
			promotionSchema.safeParse({ ...base, type: "promotion", code: null })
				.success
		).toBe(true);
	});
	it("rejeita percent com valor > 100", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			discountValue: 150,
		});
		expect(r.success).toBe(false);
	});
	it("aceita fixed com valor > 100 (R$)", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			discountType: "fixed",
			discountValue: 150,
		});
		expect(r.success).toBe(true);
	});
	it("exige >=1 ferramenta quando appliesToAll=false", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			toolIds: [],
		});
		expect(r.success).toBe(false);
	});
	it("ignora ferramentas quando appliesToAll=true", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			appliesToAll: true,
			toolIds: [],
		});
		expect(r.success).toBe(true);
	});
	it("promocode exige code e aceita maxRedemptions/minOrderAmount", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promocode",
			code: "BEMVINDO",
			maxRedemptions: 100,
			minOrderAmount: 200,
		});
		expect(r.success).toBe(true);
	});
	it("promotion não aceita maxRedemptions", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			maxRedemptions: 100,
		});
		expect(r.success).toBe(false);
	});
	it("promotion aceita maxRedemptions/minOrderAmount null (resíduo ao alternar de cupom)", () => {
		const r = promotionSchema.safeParse({
			...base,
			type: "promotion",
			code: null,
			maxRedemptions: null,
			minOrderAmount: null,
		});
		expect(r.success).toBe(true);
	});
});
