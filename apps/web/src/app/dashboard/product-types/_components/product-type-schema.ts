import { z } from "zod";

export const productTypeSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.min(2, "Nome muito curto")
		.max(120, "Nome muito longo"),
	description: z
		.string()
		.trim()
		.max(1000, "Descrição muito longa")
		.optional()
		.or(z.literal("")),
});

export type ProductTypeFormValues = z.infer<typeof productTypeSchema>;

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
