import { describe, expect, it } from "vitest";
import { startOfDaySaoPaulo } from "@/lib/format/date-input";
import { createPromotionSchema, promotionSchema } from "../promotion-schema";

const base = {
	title: "Promo",
	description: null,
	discountType: "percent",
	discountValue: 10,
	appliesToAll: false,
	active: true,
	featured: false,
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

const validBase = {
	type: "promotion" as const,
	title: "Liquidação",
	description: null,
	discountType: "percent" as const,
	discountValue: 10,
	appliesToAll: true,
	active: true,
	featured: false,
	startsAt: null as Date | null,
	endsAt: null as Date | null,
	code: null,
	toolIds: [] as string[],
};

describe("promotion-schema — datas e código", () => {
	it("aceita promoção de 1 dia (início = fim no mesmo dia)", () => {
		const day = new Date("2026-08-10T12:00:00Z");
		const r = promotionSchema.safeParse({
			...validBase,
			startsAt: day,
			endsAt: day,
		});
		expect(r.success).toBe(true);
	});

	it("rejeita fim em dia anterior ao início", () => {
		const r = promotionSchema.safeParse({
			...validBase,
			startsAt: new Date("2026-08-10T12:00:00Z"),
			endsAt: new Date("2026-08-09T12:00:00Z"),
		});
		expect(r.success).toBe(false);
	});

	it("create: aceita início hoje", () => {
		const r = createPromotionSchema.safeParse({
			...validBase,
			startsAt: startOfDaySaoPaulo(new Date()),
		});
		expect(r.success).toBe(true);
	});

	it("create: rejeita início ontem", () => {
		const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
		const r = createPromotionSchema.safeParse({
			...validBase,
			startsAt: yesterday,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita desconto zero com mensagem clara", () => {
		const r = promotionSchema.safeParse({ ...validBase, discountValue: 0 });
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.error.issues[0]?.message).toMatch(/maior que zero/i);
		}
	});

	it("normaliza código do cupom para UPPERCASE + trim", () => {
		const r = promotionSchema.safeParse({
			...validBase,
			type: "promocode",
			code: "  verao2025 ",
		});
		expect(r.success).toBe(true);
		if (r.success && r.data.type === "promocode") {
			expect(r.data.code).toBe("VERAO2025");
		}
	});
});
