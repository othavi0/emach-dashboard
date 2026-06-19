import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { z } from "zod";

export const VOLTAGE_OPTIONS = ["127V", "220V", "Bivolt", "380V"] as const;
export const TOOL_STATUS_OPTIONS = ["draft", "active", "discontinued"] as const;

export const TOOL_STATUS_LABELS: Record<
	(typeof TOOL_STATUS_OPTIONS)[number],
	string
> = {
	draft: "Rascunho",
	active: "Ativo",
	discontinued: "Descontinuado",
};

export const MIN_IMAGES_ACTIVE = 3;
export const MAX_IMAGES = 8;
export const MIN_SPECS_ACTIVE = 4;

export const toolImageSchema = z.object({
	id: z.string().optional(),
	url: z.url("URL de imagem inválida"),
	sortOrder: z.number().int().min(0),
});

const optionalString = z.string().optional().or(z.literal(""));
const optionalNumber = z
	.number()
	.nonnegative("Deve ser maior ou igual a zero")
	.optional()
	.or(z.nan().transform(() => undefined));
const optionalInt = z
	.number()
	.int()
	.nonnegative("Deve ser maior ou igual a zero")
	.optional()
	.or(z.nan().transform(() => undefined));
// Peso e dimensões são obrigatórios: a loja consome esses dados para cotar frete.
const requiredPositiveNumber = z
	.number({ error: "Campo obrigatório" })
	.positive("Deve ser maior que zero");

export const toolVariantSchema = z.object({
	id: z.string().optional(),
	sku: z.string().min(1, "SKU obrigatório"),
	voltage: z.enum(VOLTAGE_OPTIONS).optional().or(z.literal("")),
	priceAmount: z
		.number()
		.nonnegative("Preço não pode ser negativo")
		.refine((n) => !Number.isNaN(n), "Preço inválido"),
	isDefault: z.boolean().default(false),
	sortOrder: z.number().int().min(0),
});
export type ToolVariantInput = z.infer<typeof toolVariantSchema>;

export const updateVariantSchema = z.object({
	variantId: z.string().min(1),
	sku: z.string().min(1).max(64).optional(),
	voltage: z.enum(VOLTAGE_OPTIONS).nullable().optional(),
	priceAmount: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Preço inválido")
		.optional(),
});

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const attributeValueInputSchema = z.object({
	valueText: z.string().nullable().optional(),
	valueNumeric: z.number().nullable().optional(),
	valueNumericMax: z.number().nullable().optional(),
	valueBool: z.boolean().nullable().optional(),
});
export type AttributeValueInput = z.infer<typeof attributeValueInputSchema>;

export const toolFormSchema = z
	.object({
		name: z.string().min(1, "Nome obrigatório"),
		description: optionalString,
		model: optionalString,
		invoiceModel: optionalString,
		manufacturerName: optionalString,
		status: z.enum(TOOL_STATUS_OPTIONS).default("draft"),
		hsCode: optionalString,
		ncm: optionalString,
		cest: optionalString,
		powerWatts: optionalInt,
		weightKg: requiredPositiveNumber,
		lengthCm: requiredPositiveNumber,
		widthCm: requiredPositiveNumber,
		heightCm: requiredPositiveNumber,
		overweightShippingAmount: optionalNumber,
		categoryIds: z
			.array(z.string().min(1))
			.min(1, "Selecione ao menos uma categoria"),
		primaryCategoryId: z.string().min(1, "Selecione a categoria principal"),
		visibleOnSite: z.boolean().default(true),
		images: z
			.array(toolImageSchema)
			.max(MAX_IMAGES, `Máximo de ${MAX_IMAGES} imagens`),
		variants: z
			.array(toolVariantSchema)
			.min(1, "Adicione ao menos uma variante"),
		attributeValues: z
			.record(z.string(), attributeValueInputSchema)
			.default({}),
		attributeAssignments: z.array(z.string()).default([]),
		videoUrl: z.url("URL de vídeo inválida").nullable().default(null),
		videoPosterUrl: z.url("URL de poster inválida").nullable().default(null),
	})
	.superRefine((data, ctx) => {
		if (Boolean(data.videoUrl) !== Boolean(data.videoPosterUrl)) {
			ctx.addIssue({
				code: "custom",
				path: ["videoUrl"],
				message: "Vídeo e poster devem ser definidos juntos",
			});
		}
		if (data.status === "active" && data.images.length < MIN_IMAGES_ACTIVE) {
			ctx.addIssue({
				code: "custom",
				path: ["images"],
				message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
			});
		}
		if (
			data.status === "active" &&
			countFilledSpecs(data.attributeValues, data.attributeAssignments) <
				MIN_SPECS_ACTIVE
		) {
			ctx.addIssue({
				code: "custom",
				path: ["attributeValues"],
				message: `Ativar exige ao menos ${MIN_SPECS_ACTIVE} especificações preenchidas. Se a categoria tiver poucos atributos, anexe atributos extras do catálogo.`,
			});
		}
		if (!data.categoryIds.includes(data.primaryCategoryId)) {
			ctx.addIssue({
				code: "custom",
				path: ["primaryCategoryId"],
				message: "A categoria principal deve estar selecionada",
			});
		}
		const defaults = data.variants.filter((v) => v.isDefault);
		if (defaults.length !== 1) {
			ctx.addIssue({
				code: "custom",
				path: ["variants"],
				message: "Marque exatamente uma variante como padrão",
			});
		}
		const skus = new Set<string>();
		for (let i = 0; i < data.variants.length; i++) {
			const sku = data.variants[i]?.sku;
			if (sku && skus.has(sku)) {
				ctx.addIssue({
					code: "custom",
					path: ["variants", i, "sku"],
					message: "SKU duplicado entre variantes",
				});
			}
			if (sku) {
				skus.add(sku);
			}
		}
		const assignmentSet = new Set(data.attributeAssignments);
		for (const slug of Object.keys(data.attributeValues)) {
			if (!assignmentSet.has(slug)) {
				ctx.addIssue({
					code: "custom",
					path: ["attributeValues", slug],
					message:
						"Valor preenchido para atributo que não está vinculado à ferramenta",
				});
			}
		}
	});

export type ToolFormValues = z.infer<typeof toolFormSchema>;
export type ToolImageValue = z.infer<typeof toolImageSchema>;
export type ToolStatusValue = (typeof TOOL_STATUS_OPTIONS)[number];

function isSpecFilled(v: AttributeValueInput): boolean {
	if (typeof v.valueText === "string" && v.valueText.trim() !== "") {
		return true;
	}
	if (typeof v.valueNumeric === "number" && !Number.isNaN(v.valueNumeric)) {
		return true;
	}
	if (
		typeof v.valueNumericMax === "number" &&
		!Number.isNaN(v.valueNumericMax)
	) {
		return true;
	}
	if (typeof v.valueBool === "boolean") {
		return true;
	}
	return false;
}

/**
 * Conta atributos que estão vinculados (slug em `assignments`) E com valor real
 * preenchido. Usado pela regra de ativação (mínimo MIN_SPECS_ACTIVE) e pelo
 * contador no editor de specs. `valueBool` false conta — é decisão consciente.
 */
export function countFilledSpecs(
	attributeValues: Record<string, AttributeValueInput>,
	assignments: string[]
): number {
	let count = 0;
	for (const slug of assignments) {
		const v = attributeValues[slug];
		if (v && isSpecFilled(v)) {
			count++;
		}
	}
	return count;
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
