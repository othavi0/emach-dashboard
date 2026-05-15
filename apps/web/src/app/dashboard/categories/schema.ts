import { z } from "zod";

export const categorySchema = z.object({
	name: z.string().min(1, "Nome obrigatório").max(120, "Nome muito longo"),
	slug: z
		.string()
		.min(1, "Slug obrigatório")
		.max(120, "Slug muito longo")
		.regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens"),
	parentId: z.string().nullable().optional(),
	description: z
		.string()
		.max(2000, "Descrição muito longa")
		.nullable()
		.optional(),
	isActive: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categorySchema>;
