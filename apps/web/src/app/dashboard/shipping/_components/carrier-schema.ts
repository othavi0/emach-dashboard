import { z } from "zod";

import { isValidCnpj } from "@/lib/cpf-cnpj";

const pct = z.number().min(0, "≥ 0").max(100, "≤ 100").optional().nullable();
const money = z
	.number()
	.nonnegative("≥ 0")
	.max(1_000_000)
	.optional()
	.nullable();

export const carrierSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(120),
	cnpj: z
		.string()
		.trim()
		.refine((v) => !v || isValidCnpj(v), "CNPJ inválido")
		.optional()
		.or(z.literal("")),
	active: z.boolean().default(true),
	cubageDivisor: z
		.number()
		.int("Inteiro")
		.positive("> 0")
		.max(100_000)
		.default(6000),
	grisPercent: pct,
	grisMinAmount: money,
	advaloremPercent: pct,
	tollAmount: money,
	icmsPercent: z.number().min(0).max(99.99).optional().nullable(),
	notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CarrierFormValues = z.infer<typeof carrierSchema>;
