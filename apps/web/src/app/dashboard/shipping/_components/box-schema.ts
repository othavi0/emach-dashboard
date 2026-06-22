import { z } from "zod";

const dim = z
	.number({ message: "Obrigatório" })
	.positive("Deve ser maior que zero")
	.max(1000, "Valor muito alto");

export const boxSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.max(80, "Nome muito longo"),
	internalLengthCm: dim,
	internalWidthCm: dim,
	internalHeightCm: dim,
	maxWeightKg: z
		.number({ message: "Obrigatório" })
		.positive("Deve ser maior que zero")
		.max(1000),
	tareWeightKg: z
		.number()
		.nonnegative("Não pode ser negativo")
		.max(100)
		.default(0),
	active: z.boolean().default(true),
});

export type BoxFormValues = z.infer<typeof boxSchema>;
