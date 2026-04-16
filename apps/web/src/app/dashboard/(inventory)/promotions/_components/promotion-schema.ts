import { z } from "zod";

// ---------------------------------------------------------------------------
// Base fields shared by both promotion variants
// ---------------------------------------------------------------------------

const promotionBaseFields = {
	title: z
		.string()
		.trim()
		.max(120, "Título não pode ultrapassar 120 caracteres")
		.refine((v) => v.length > 0, "Título obrigatório")
		.refine(
			(v) => v.length === 0 || v.length >= 2,
			"Título deve ter no mínimo 2 caracteres"
		),

	description: z
		.string()
		.trim()
		.max(1000, "Descrição não pode ultrapassar 1000 caracteres")
		.optional()
		.nullable(),

	discountPct: z
		.number()
		.gt(0, "Desconto deve ser entre 0,01% e 100%")
		.max(100, "Desconto deve ser entre 0,01% e 100%"),

	active: z.boolean(),

	startsAt: z.date().optional().nullable(),

	endsAt: z.date().optional().nullable(),

	toolIds: z.array(z.string()).min(1, "Selecione ao menos uma ferramenta"),
};

// ---------------------------------------------------------------------------
// Discriminated union: 'promotion' variant — code must be absent / null
// ---------------------------------------------------------------------------

const promotionVariantSchema = z
	.object({
		type: z.literal("promotion"),
		code: z.string().nullish(),
		...promotionBaseFields,
	})
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
			/^[\x20-\x7E]+$/,
			"Código deve conter apenas caracteres ASCII imprimíveis"
		),
	...promotionBaseFields,
});

// ---------------------------------------------------------------------------
// Main schema — discriminated union on `type`
// ---------------------------------------------------------------------------

export const promotionSchema = z
	.discriminatedUnion("type", [promotionVariantSchema, promocodeVariantSchema])
	.superRefine((data, ctx) => {
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

		// Cross-field: toolIds min 1 (belt-and-suspenders — array().min(1) above
		// covers per-field, but keep here in case callers use superRefine output)
		if (!data.toolIds || data.toolIds.length < 1) {
			ctx.addIssue({
				code: "custom",
				message: "Selecione ao menos uma ferramenta",
				path: ["toolIds"],
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
