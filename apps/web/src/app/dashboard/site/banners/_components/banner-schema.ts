import { z } from "zod";

export const MAX_ACTIVE_BANNERS = 6;

export const BANNER_LAYOUTS = [
	"split",
	"stack_left",
	"center_bottom",
	"center_mid",
	"center_cta_right",
	"mirror_split",
	"hero_center",
	"text_right",
] as const;
export const BANNER_CTA_VARIANTS = ["red", "dark", "white", "ghost"] as const;
export const BANNER_BG_MOBILE_MODES = ["inherit", "custom", "none"] as const;

export type BannerLayout = (typeof BANNER_LAYOUTS)[number];
export type BannerCtaVariant = (typeof BANNER_CTA_VARIANTS)[number];
export type BannerBgMobileMode = (typeof BANNER_BG_MOBILE_MODES)[number];

const CTA_HREF_RE = /^(\/|https:\/\/)/;

const optionalText = (max: number) =>
	z.string().trim().max(max, `Máx ${max} caracteres`).nullable();

export const bannerFormSchema = z
	.object({
		backgroundImageUrl: z.string().nullable(),
		backgroundImageMobileUrl: z.string().nullable(),
		backgroundMobileMode: z.enum(BANNER_BG_MOBILE_MODES),
		productImageUrl: z.string().nullable(),
		productImageMobileUrl: z.string().nullable(),
		title: optionalText(80),
		subtitle: optionalText(140),
		specs: z
			.array(
				z.string().trim().min(1, "Spec vazia").max(24, "Máx 24 caracteres")
			)
			.max(6, "Máx 6 specs")
			.nullable(),
		altText: optionalText(160),
		badgeText: optionalText(16),
		ctaLabel: optionalText(30),
		ctaHref: z.string().trim().nullable(),
		ctaVariant: z.enum(BANNER_CTA_VARIANTS),
		layout: z.enum(BANNER_LAYOUTS),
		productScale: z.number().int().min(50).max(160).default(100),
		ctaScale: z.number().int().min(80).max(140).default(100),
		countdownTarget: z.date().nullable(),
		isActive: z.boolean(),
	})
	.superRefine((v, ctx) => {
		if (!(v.backgroundImageUrl || v.title || v.badgeText)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [],
				message:
					"O banner precisa de imagem de fundo ou ao menos título/badge.",
			});
		}
		if (v.backgroundImageUrl && !v.altText) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["altText"],
				message: "Texto alternativo é obrigatório quando há imagem de fundo.",
			});
		}
		if (
			v.backgroundImageUrl &&
			v.backgroundMobileMode === "custom" &&
			!v.backgroundImageMobileUrl
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["backgroundImageMobileUrl"],
				message:
					"Envie uma imagem mobile (9:16) ou troque o modo do fundo no mobile.",
			});
		}
		const hasLabel = Boolean(v.ctaLabel);
		const hasHref = Boolean(v.ctaHref);
		if (hasLabel !== hasHref) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ctaHref"],
				message:
					"Preencha rótulo e link do botão juntos (ou deixe ambos vazios).",
			});
		}
		if (hasHref && v.ctaHref && !CTA_HREF_RE.test(v.ctaHref)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ctaHref"],
				message: "Use uma rota interna (/...) ou URL https://",
			});
		}
		if (v.countdownTarget && v.countdownTarget.getTime() <= Date.now()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["countdownTarget"],
				message: "A data do countdown deve estar no futuro.",
			});
		}
	});

export type BannerFormValues = z.infer<typeof bannerFormSchema>;
