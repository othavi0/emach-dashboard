import { z } from "zod";

export const VOLTAGE_OPTIONS = ["127V", "220V", "Bivolt", "380V"] as const;

export const toolFormSchema = z.object({
	name: z.string().min(1, "Nome obrigatório"),
	slug: z
		.string()
		.min(1, "Slug obrigatório")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug deve conter apenas letras minúsculas, números e hífens"
		),
	description: z.string().optional().or(z.literal("")),
	sku: z.string().min(1, "SKU obrigatório"),
	voltage: z.enum(VOLTAGE_OPTIONS).optional().or(z.literal("")),
	price: z
		.number()
		.nonnegative("Preço deve ser maior ou igual a zero")
		.optional()
		.or(z.nan().transform(() => undefined)),
	cost: z
		.number()
		.nonnegative("Custo deve ser maior ou igual a zero")
		.optional()
		.or(z.nan().transform(() => undefined)),
	categoryId: z.string().min(1, "Categoria obrigatória"),
	supplierId: z.string().optional().or(z.literal("")),
	visibleOnSite: z.boolean().default(true),
	imageUrl: z.url("URL de imagem inválida").optional().or(z.literal("")),
});

export type ToolFormValues = z.infer<typeof toolFormSchema>;

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
