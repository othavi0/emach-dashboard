import { z } from "zod";

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

	discountValue: z.number().gt(0, "Valor do desconto deve ser maior que zero"),

	appliesToAll: z.boolean(),

	active: z.boolean(),

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
		.min(1, "Código obrigatório para promocode")
		.max(50, "Código não pode ultrapassar 50 caracteres")
		.regex(
			ASCII_PRINTABLE_REGEX,
			"Código deve conter apenas caracteres ASCII imprimíveis"
		),
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

		// Cross-field: endsAt must be after startsAt when both are set
		if (
			data.startsAt != null &&
			data.endsAt != null &&
			data.endsAt <= data.startsAt
		) {
			ctx.addIssue({
				code: "custom",
				message: "Data de fim deve ser posterior à data de início",
				path: ["endsAt"],
			});
		}
	});

// ---------------------------------------------------------------------------
// Create-only schema — adds startsAt >= now refine (edit omits this check)
// ---------------------------------------------------------------------------

export const createPromotionSchema = promotionSchema.superRefine(
	(data, ctx) => {
		if (data.startsAt != null && data.startsAt < new Date()) {
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
