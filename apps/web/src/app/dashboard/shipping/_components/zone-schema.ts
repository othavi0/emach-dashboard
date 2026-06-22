import { z } from "zod";

export const cepRangeSchema = z
	.object({
		from: z
			.string()
			.trim()
			.regex(/^\d{8}$/, "8 dígitos"),
		to: z
			.string()
			.trim()
			.regex(/^\d{8}$/, "8 dígitos"),
		label: z.string().trim().max(60).optional(),
	})
	.refine((r) => r.from <= r.to, {
		message: "De deve ser ≤ Até",
		path: ["to"],
	});

export const zoneSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(80),
	cepRanges: z
		.array(cepRangeSchema)
		.min(1, "Adicione ao menos uma faixa de CEP")
		.max(50),
	deliveryDays: z.number().int().min(0).max(365).optional().nullable(),
	minFreightAmount: z.number().nonnegative().max(100_000).optional().nullable(),
});
export type ZoneFormValues = z.infer<typeof zoneSchema>;

export const rateRowSchema = z
	.object({
		weightFromKg: z.number().nonnegative("≥ 0"),
		weightToKg: z.number().positive("> 0").nullable(), // null = ∞
		baseAmount: z.number().nonnegative("≥ 0"),
		perKgAmount: z.number().nonnegative("≥ 0").default(0),
	})
	.refine((r) => r.weightToKg === null || r.weightToKg > r.weightFromKg, {
		message: "Até deve ser > De",
		path: ["weightToKg"],
	});
export type RateRow = z.infer<typeof rateRowSchema>;

export const ratesSchema = z
	.array(rateRowSchema)
	.min(1, "Adicione ao menos uma faixa");
