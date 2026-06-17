import { describe, expect, it } from "vitest";
import { bannerFormSchema, MAX_ACTIVE_BANNERS } from "../banner-schema";

const base = {
	backgroundImageUrl:
		"https://x.supabase.co/storage/v1/object/public/banner-images/a.jpg",
	backgroundImageMobileUrl: null,
	backgroundMobileMode: "inherit" as const,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: "Potência redefinida",
	subtitle: null,
	altText: "EMACH — Potência",
	badgeText: null,
	ctaLabel: "Ver Catálogo",
	ctaHref: "/catalog",
	ctaVariant: "red" as const,
	layout: "split" as const,
	countdownTarget: null,
	isActive: false,
};

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

describe("bannerFormSchema", () => {
	it("aceita um banner completo válido", () => {
		expect(bannerFormSchema.safeParse(base).success).toBe(true);
	});

	it("aceita banner só com título (sem fundo)", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundImageUrl: null,
			altText: null,
			title: "Só título",
			ctaLabel: null,
			ctaHref: null,
		});
		expect(r.success).toBe(true);
	});

	it("rejeita banner 100% vazio (sem fundo, título nem badge)", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundImageUrl: null,
			altText: null,
			title: null,
			badgeText: null,
			ctaLabel: null,
			ctaHref: null,
		});
		expect(r.success).toBe(false);
	});

	it("exige altText quando há fundo", () => {
		const r = bannerFormSchema.safeParse({ ...base, altText: null });
		expect(r.success).toBe(false);
	});

	it("exige ctaLabel e ctaHref juntos", () => {
		expect(bannerFormSchema.safeParse({ ...base, ctaHref: null }).success).toBe(
			false
		);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaLabel: null }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaLabel: null, ctaHref: null })
				.success
		).toBe(true);
	});

	it("valida formato do ctaHref", () => {
		expect(
			bannerFormSchema.safeParse({ ...base, ctaHref: "catalog" }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaHref: "https://x.com" }).success
		).toBe(true);
	});

	it("exige countdown no futuro", () => {
		expect(
			bannerFormSchema.safeParse({ ...base, countdownTarget: past() }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, countdownTarget: future() }).success
		).toBe(true);
	});

	it("aplica lengths (title ≤80, badge ≤16, ctaLabel ≤30, subtitle ≤140)", () => {
		expect(
			bannerFormSchema.safeParse({ ...base, title: "a".repeat(81) }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, badgeText: "a".repeat(17) }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaLabel: "a".repeat(31) }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, subtitle: "a".repeat(141) }).success
		).toBe(false);
	});

	it("valida enums layout e ctaVariant", () => {
		expect(
			bannerFormSchema.safeParse({ ...base, layout: "weird" }).success
		).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaVariant: "blue" }).success
		).toBe(false);
	});

	it("expõe MAX_ACTIVE_BANNERS = 6", () => {
		expect(MAX_ACTIVE_BANNERS).toBe(6);
	});
});
