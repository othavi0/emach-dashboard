import { z } from "zod";
import { saoPauloDayKey } from "@/lib/format/date-input";
import { HOME_MIN_PRODUCTS } from "../_lib/featured-home";

const ASCII_PRINTABLE_REGEX = /^[\x20-\x7E]+$/;

// ---------------------------------------------------------------------------
// Base fields shared by both promotion variants
// ---------------------------------------------------------------------------

const promotionBaseFields = {
	title: z
		.string()
		.trim()
		.max(120, "Título não pode ultrapassar 120 caracteres")
		.refine((v) => v.length >= 2, "Título deve ter no mínimo 2 caracteres"),

	description: z
		.string()
		.trim()
		.max(1000, "Descrição não pode ultrapassar 1000 caracteres")
		.optional()
		.nullable(),

	discountType: z.enum(["percent", "fixed"]),

	discountValue: z
		.number()
		.gt(0, "Informe um valor de desconto maior que zero"),

	appliesToAll: z.boolean(),

	active: z.boolean(),

	featured: z.boolean(),

	startsAt: z.date().optional().nullable(),

	endsAt: z.date().optional().nullable(),

	toolIds: z.array(z.string()),
};

// ---------------------------------------------------------------------------
// Discriminated union: 'promotion' variant — code must be absent / null
// Uses .strict() to reject extra fields (e.g. maxRedemptions, minOrderAmount)
// ---------------------------------------------------------------------------

const promotionVariantSchema = z
	.object({
		type: z.literal("promotion"),
		code: z.string().nullish(),
		// Aceitam apenas null/ausente: o form pode carregar essas chaves (resíduo
		// ao alternar de cupom→automática). Declará-las evita que .strict() rejeite
		// o submit; qualquer valor não-nulo continua barrado.
		maxRedemptions: z.null().optional(),
		minOrderAmount: z.null().optional(),
		...promotionBaseFields,
	})
	.strict()
	.refine((data) => data.code == null, {
		message: "Promoções automáticas não aceitam código",
		path: ["code"],
	});

// ---------------------------------------------------------------------------
// Discriminated union: 'promocode' variant — code required, ASCII printable
// ---------------------------------------------------------------------------

const promocodeVariantSchema = z.object({
	type: z.literal("promocode"),
	// ASCII printable: 0x20–0x7E, length 1–50
	code: z
		.string()
		.trim()
		.min(1, "Código obrigatório para promocode")
		.max(50, "Código não pode ultrapassar 50 caracteres")
		.regex(
			ASCII_PRINTABLE_REGEX,
			"Código deve conter apenas caracteres ASCII imprimíveis"
		)
		.transform((v) => v.toUpperCase()),
	maxRedemptions: z.number().int().min(1).optional().nullable(),
	minOrderAmount: z.number().min(0).optional().nullable(),
	...promotionBaseFields,
});

// ---------------------------------------------------------------------------
// Main schema — discriminated union on `type`
// ---------------------------------------------------------------------------

export const promotionSchema = z
	.discriminatedUnion("type", [promotionVariantSchema, promocodeVariantSchema])
	.superRefine((data, ctx) => {
		// percent desconto: máx 100%
		if (data.discountType === "percent" && data.discountValue > 100) {
			ctx.addIssue({
				code: "custom",
				message: "Percentual não pode passar de 100%",
				path: ["discountValue"],
			});
		}

		// toolIds exigido quando appliesToAll=false
		if (!data.appliesToAll && data.toolIds.length < 1) {
			ctx.addIssue({
				code: "custom",
				message: "Selecione ao menos uma ferramenta",
				path: ["toolIds"],
			});
		}

		// Promoção destacada precisa de ao menos HOME_MIN_PRODUCTS produtos
		// específicos para o storefront renderizar a seção da home.
		if (
			data.featured &&
			data.type === "promotion" &&
			!data.appliesToAll &&
			data.toolIds.length < HOME_MIN_PRODUCTS
		) {
			ctx.addIssue({
				code: "custom",
				message: `Promoção destacada precisa de ao menos ${HOME_MIN_PRODUCTS} produtos para aparecer na home`,
				path: ["toolIds"],
			});
		}

		// Cross-field: fim não pode cair em dia anterior ao início (comparação por
		// dia no fuso SP — permite promoção de 1 dia, com início 00:00 e fim 23:59)
		if (
			data.startsAt != null &&
			data.endsAt != null &&
			saoPauloDayKey(data.endsAt) < saoPauloDayKey(data.startsAt)
		) {
			ctx.addIssue({
				code: "custom",
				message: "Data de fim não pode ser anterior à data de início",
				path: ["endsAt"],
			});
		}
	});

// ---------------------------------------------------------------------------
// Create-only schema — adds startsAt >= now refine (edit omits this check)
// ---------------------------------------------------------------------------

export const createPromotionSchema = promotionSchema.superRefine(
	(data, ctx) => {
		if (
			data.startsAt != null &&
			saoPauloDayKey(data.startsAt) < saoPauloDayKey(new Date())
		) {
			ctx.addIssue({
				code: "custom",
				message: "Data de início não pode ser no passado",
				path: ["startsAt"],
			});
		}
	}
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PromotionFormValues = z.infer<typeof promotionSchema>;
export type CreatePromotionFormValues = z.infer<typeof createPromotionSchema>;
