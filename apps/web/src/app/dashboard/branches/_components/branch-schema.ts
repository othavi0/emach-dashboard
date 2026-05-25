import { z } from "zod";

const phoneRegex = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;
const cepDigitsRegex = /^\d{8}$/;
const ufRegex = /^[A-Z]{2}$/;

const optionalTrimmed = z
	.string()
	.trim()
	.optional()
	.or(z.literal(""))
	.transform((v) => (v ? v : undefined));

export const branchSchema = z
	.object({
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
			.refine((v) => v === "" || cepDigitsRegex.test(v), "CEP inválido")
			.optional()
			.transform((v) => (v ? v : undefined)),
		street: optionalTrimmed.pipe(
			z.string().max(200, "Rua muito longa").optional()
		),
		streetNumber: optionalTrimmed.pipe(
			z.string().max(20, "Número muito longo").optional()
		),
		complement: optionalTrimmed.pipe(
			z.string().max(100, "Complemento muito longo").optional()
		),
		neighborhood: optionalTrimmed.pipe(
			z.string().max(120, "Bairro muito longo").optional()
		),
		city: optionalTrimmed.pipe(
			z.string().max(120, "Cidade muito longa").optional()
		),
		state: z
			.string()
			.trim()
			.toUpperCase()
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined))
			.refine((v) => !v || ufRegex.test(v), "UF inválido (use 2 letras)"),
		responsibleUserId: optionalTrimmed.pipe(z.string().min(1).optional()),
	})
	.refine(
		(data) => {
			if (!data.cep) {
				return true;
			}
			return Boolean(
				data.street && data.streetNumber && data.city && data.state
			);
		},
		{
			message:
				"Quando CEP é preenchido, rua, número, cidade e UF são obrigatórios",
			path: ["cep"],
		}
	);

export type BranchFormValues = z.infer<typeof branchSchema>;
