import { z } from "zod";

export const supplierSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.min(2, "Nome muito curto")
		.max(120, "Nome muito longo"),
	contactEmail: z
		.email("E-mail inválido")
		.max(180, "E-mail muito longo")
		.optional()
		.or(z.literal("")),
	phone: z
		.string()
		.trim()
		.max(40, "Telefone muito longo")
		.optional()
		.or(z.literal("")),
	notes: z
		.string()
		.trim()
		.max(1000, "Observações muito longas")
		.optional()
		.or(z.literal("")),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
