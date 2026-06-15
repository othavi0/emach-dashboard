import type { BannerFormValues } from "./banner-schema";

export type SlotKey =
	| "background"
	| "product"
	| "title"
	| "badge"
	| "countdown"
	| "cta";

export const SLOT_FIELDS: Record<SlotKey, (keyof BannerFormValues)[]> = {
	background: ["backgroundImageUrl", "backgroundImageMobileUrl", "altText"],
	product: ["productImageUrl", "productImageMobileUrl"],
	title: ["title", "subtitle"],
	badge: ["badgeText"],
	countdown: ["countdownTarget"],
	cta: ["ctaLabel", "ctaHref"],
};

export const SLOT_LABELS: Record<SlotKey, string> = {
	background: "Fundo",
	product: "Produto central",
	title: "Título + descrição",
	badge: "Badge / selo",
	countdown: "Countdown",
	cta: "Botão (CTA)",
};

export interface BannerPreset {
	hint: string;
	key: string;
	label: string;
	layout: BannerFormValues["layout"];
	slots: SlotKey[];
}

export const PRESETS: BannerPreset[] = [
	{
		key: "produto",
		label: "Produto em destaque",
		hint: "fundo + produto + texto + CTA · split",
		slots: ["background", "product", "title", "cta"],
		layout: "split",
	},
	{
		key: "promo",
		label: "Promo full-text",
		hint: "fundo + badge + texto + CTA · centralizado",
		slots: ["background", "badge", "title", "cta"],
		layout: "center_mid",
	},
	{
		key: "countdown",
		label: "Countdown",
		hint: "fundo + produto + contador + CTA",
		slots: ["background", "product", "title", "countdown", "cta"],
		layout: "split",
	},
	{
		key: "imagem",
		label: "Imagem pura",
		hint: "só fundo + CTA",
		slots: ["background", "cta"],
		layout: "split",
	},
];
