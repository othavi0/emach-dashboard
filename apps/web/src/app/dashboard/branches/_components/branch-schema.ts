import { z } from "zod";

const phoneRegex = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;
const cepDigitsRegex = /^\d{8}$/;
const ufRegex = /^[A-Z]{2}$/;
const CEP_RANGE_REGEX = /^\d{5}-?\d{3}$/;

export const cepRangeSchema = z.object({
	from: z.string().regex(CEP_RANGE_REGEX, "CEP inválido (00000-000)"),
	to: z.string().regex(CEP_RANGE_REGEX, "CEP inválido (00000-000)"),
});

const optionalTrimmed = z
	.string()
	.trim()
	.optional()
	.or(z.literal(""))
	.transform((v) => (v ? v : undefined));

export const branchSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.min(2, "Nome muito curto")
		.max(120, "Nome muito longo"),
	status: z.enum(["active", "inactive"]).default("active"),
	phone: z
		.string()
		.trim()
		.max(40, "Telefone muito longo")
		.regex(phoneRegex, "Telefone inválido")
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : undefined)),
	cep: z
		.string()
		.trim()
		.transform((v) => v.replace(/\D/g, ""))
		.refine((v) => cepDigitsRegex.test(v), "CEP obrigatório (8 dígitos)"),
	street: z
		.string()
		.trim()
		.min(1, "Rua obrigatória")
		.max(200, "Rua muito longa"),
	streetNumber: z
		.string()
		.trim()
		.min(1, "Número obrigatório")
		.max(20, "Número muito longo"),
	complement: optionalTrimmed.pipe(
		z.string().max(100, "Complemento muito longo").optional()
	),
	neighborhood: optionalTrimmed.pipe(
		z.string().max(120, "Bairro muito longo").optional()
	),
	city: z
		.string()
		.trim()
		.min(1, "Cidade obrigatória")
		.max(120, "Cidade muito longa"),
	state: z
		.string()
		.trim()
		.toUpperCase()
		.min(1, "UF obrigatória")
		.refine((v) => v === "" || ufRegex.test(v), "UF inválido (use 2 letras)"),
	responsibleUserId: optionalTrimmed.pipe(z.string().min(1).optional()),
	cepRanges: z.array(cepRangeSchema).max(20).optional().nullable(),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
