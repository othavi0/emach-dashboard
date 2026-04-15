import { z } from "zod";

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
});

export type BranchFormValues = z.infer<typeof branchSchema>;
