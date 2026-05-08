import type { AttributeOptions } from "@emach/db/schema/attributes";
import { z } from "zod";

export const ATTRIBUTE_INPUT_TYPES = [
	"text",
	"number",
	"select",
	"boolean",
	"numeric_range",
	"color",
] as const;

export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPES)[number];

export const ATTRIBUTE_INPUT_TYPE_LABELS: Record<AttributeInputType, string> = {
	text: "Texto livre",
	number: "Número",
	select: "Lista de opções",
	boolean: "Sim / Não",
	numeric_range: "Faixa numérica (mín–máx)",
	color: "Cor",
};

// categoryId NÃO faz parte do form — é injetado pela página da categoria
// no momento de chamar a server action.
export const attributeFormSchema = z
	.object({
		slug: z
			.string()
			.min(1, "Slug obrigatório")
			.regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
		label: z.string().min(1, "Rótulo obrigatório"),
		inputType: z.enum(ATTRIBUTE_INPUT_TYPES),
		unit: z.string().optional().or(z.literal("")),
		isRequired: z.boolean().default(false),
		sortOrder: z.number().int().min(0).default(0),
		options: z
			.array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
			.default([]),
		swatches: z
			.array(
				z.object({
					value: z.string().min(1),
					label: z.string().min(1),
					hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use formato #rrggbb"),
				})
			)
			.default([]),
	})
	.superRefine((data, ctx) => {
		if (data.inputType === "select" && data.options.length < 1) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "Adicione ao menos uma opção",
			});
		}
		if (data.inputType === "color" && data.swatches.length < 1) {
			ctx.addIssue({
				code: "custom",
				path: ["swatches"],
				message: "Adicione ao menos uma cor",
			});
		}
	});

export type AttributeFormValues = z.infer<typeof attributeFormSchema>;

export function buildOptionsField(
	values: AttributeFormValues
): AttributeOptions | null {
	if (values.inputType === "select") {
		return { kind: "select", options: values.options };
	}
	if (values.inputType === "color") {
		return { kind: "color", swatches: values.swatches };
	}
	return null;
}

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlugFormat(slug: string): string | null {
	if (slug.trim() === "") {
		return "Slug obrigatório";
	}
	if (!SLUG_REGEX.test(slug)) {
		return "Use apenas letras minúsculas, números e hífens (sem espaços ou acentos)";
	}
	return null;
}

export function slugifyLabel(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
