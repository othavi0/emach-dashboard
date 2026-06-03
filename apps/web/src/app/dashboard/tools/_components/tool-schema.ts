import type {
	AttributeDefinition,
	AttributeOptions,
} from "@emach/db/schema/attributes";
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
	costAmount: optionalNumber,
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
	costAmount: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Custo inválido")
		.nullable()
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
		categoryIds: z
			.array(z.string().min(1))
			.min(1, "Selecione ao menos uma categoria"),
		primaryCategoryId: z.string().min(1, "Selecione a categoria principal"),
		supplierId: optionalString,
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
	})
	.superRefine((data, ctx) => {
		if (data.status === "active" && data.images.length < MIN_IMAGES_ACTIVE) {
			ctx.addIssue({
				code: "custom",
				path: ["images"],
				message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
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

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

/**
 * Builds a Zod object schema for attributeValues based on the active definitions.
 * Each definition contributes a field keyed by `slug` whose validator follows `inputType`.
 * Required fields fail validation when value is missing/empty.
 */
export function buildAttributeValuesSchema(
	definitions: Pick<
		AttributeDefinition,
		"slug" | "inputType" | "isRequired" | "options"
	>[]
) {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const def of definitions) {
		shape[def.slug] = buildOneAttributeSchema(def);
	}
	return z.object(shape);
}

function resolveOptionValues(opts: AttributeOptions | null): string[] {
	if (!opts) {
		return [];
	}
	if ("options" in opts) {
		return opts.options.map((o) => o.value);
	}
	if ("swatches" in opts) {
		return opts.swatches.map((s) => s.value);
	}
	return [];
}

function buildOneAttributeSchema(
	def: Pick<AttributeDefinition, "inputType" | "isRequired" | "options">
): z.ZodTypeAny {
	const required = def.isRequired;
	const opts = def.options as AttributeOptions | null;

	switch (def.inputType) {
		case "text": {
			const base = z.string();
			return required
				? base.min(1, "Campo obrigatório")
				: base.optional().or(z.literal(""));
		}
		case "number": {
			const base = z
				.number()
				.refine((n) => !Number.isNaN(n), "Número inválido");
			return required
				? base
				: base.optional().or(z.nan().transform(() => undefined));
		}
		case "boolean": {
			const base = z.boolean();
			return required ? base : base.optional();
		}
		case "select":
		case "color": {
			const values = resolveOptionValues(opts);
			if (values.length === 0) {
				return required
					? z.string().min(1, "Campo obrigatório")
					: z.string().optional();
			}
			const enumSchema = z.enum(values as [string, ...string[]]);
			return required ? enumSchema : enumSchema.optional();
		}
		case "numeric_range": {
			const range = z
				.object({
					min: z.number(),
					max: z.number().optional(),
				})
				.refine((v) => v.max === undefined || v.max >= v.min, {
					message: "Máximo deve ser ≥ mínimo",
					path: ["max"],
				});
			return required ? range : range.optional();
		}
		default:
			return z.unknown().optional();
	}
}
