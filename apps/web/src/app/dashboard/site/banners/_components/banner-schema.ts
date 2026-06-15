import { z } from "zod";

export const MAX_ACTIVE_BANNERS = 6;

const CTA_HREF_RE = /^(\/|https:\/\/)/;

const nullableTrimmed = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v.length === 0 ? null : v))
		.nullable()
		.or(z.null());

export const bannerFormSchema = z.object({
	backgroundImageUrl: z.string().min(1, "Imagem de fundo é obrigatória"),
	backgroundImageMobileUrl: z.string().nullable(),
	productImageUrl: z.string().nullable(),
	productImageMobileUrl: z.string().nullable(),
	title: z
		.string()
		.trim()
		.min(1, "Título é obrigatório")
		.max(80, "Máx 80 caracteres"),
	subtitle: nullableTrimmed(140),
	altText: z.string().trim().min(1, "Texto alternativo é obrigatório"),
	ctaLabel: z
		.string()
		.trim()
		.min(1, "Rótulo do botão é obrigatório")
		.max(30, "Máx 30 caracteres"),
	ctaHref: z
		.string()
		.trim()
		.min(1, "Link do botão é obrigatório")
		.regex(CTA_HREF_RE, "Use uma rota interna (/...) ou URL https://"),
	isActive: z.boolean(),
});

export type BannerFormValues = z.infer<typeof bannerFormSchema>;
