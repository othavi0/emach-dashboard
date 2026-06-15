import { describe, expect, it } from "vitest";
import { bannerFormSchema, MAX_ACTIVE_BANNERS } from "../banner-schema";

const valid = {
	backgroundImageUrl:
		"https://x.supabase.co/storage/v1/object/public/banner-images/a.jpg",
	backgroundImageMobileUrl: null,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: "Potência redefinida",
	subtitle: null,
	altText: "EMACH — Potência redefinida",
	ctaLabel: "Ver Catálogo",
	ctaHref: "/catalog",
	isActive: false,
};

describe("bannerFormSchema", () => {
	it("aceita um banner válido", () => {
		expect(bannerFormSchema.safeParse(valid).success).toBe(true);
	});

	it("exige backgroundImageUrl", () => {
		const r = bannerFormSchema.safeParse({ ...valid, backgroundImageUrl: "" });
		expect(r.success).toBe(false);
	});

	it("rejeita title acima de 80 chars", () => {
		const r = bannerFormSchema.safeParse({ ...valid, title: "a".repeat(81) });
		expect(r.success).toBe(false);
	});

	it("rejeita ctaLabel acima de 30 chars", () => {
		const r = bannerFormSchema.safeParse({
			...valid,
			ctaLabel: "a".repeat(31),
		});
		expect(r.success).toBe(false);
	});

	it("rejeita subtitle acima de 140 chars", () => {
		const r = bannerFormSchema.safeParse({
			...valid,
			subtitle: "a".repeat(141),
		});
		expect(r.success).toBe(false);
	});

	it("aceita ctaHref interno (/) e externo (https://)", () => {
		expect(
			bannerFormSchema.safeParse({ ...valid, ctaHref: "/catalog" }).success
		).toBe(true);
		expect(
			bannerFormSchema.safeParse({ ...valid, ctaHref: "https://x.com" }).success
		).toBe(true);
	});

	it("rejeita ctaHref que não começa com / nem https://", () => {
		expect(
			bannerFormSchema.safeParse({ ...valid, ctaHref: "catalog" }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...valid, ctaHref: "http://x.com" }).success
		).toBe(false);
	});

	it("expõe MAX_ACTIVE_BANNERS = 6", () => {
		expect(MAX_ACTIVE_BANNERS).toBe(6);
	});
});
