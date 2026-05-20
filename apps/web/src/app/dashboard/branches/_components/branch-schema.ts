import { z } from "zod";

const phoneRegex = /^[\d\s()+-]+$/;

export const branchSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.min(2, "Nome muito curto")
		.max(120, "Nome muito longo"),
	address: z
		.string()
		.trim()
		.max(500, "Endereço muito longo")
		.optional()
		.or(z.literal("")),
	phone: z
		.string()
		.trim()
		.max(40, "Telefone muito longo")
		.regex(phoneRegex, "Telefone inválido")
		.optional()
		.or(z.literal("")),
	responsibleUserId: z.string().trim().optional().or(z.literal("")),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
