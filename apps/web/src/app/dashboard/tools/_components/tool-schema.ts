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
const optionalInt = z
	.number()
	.int()
	.nonnegative("Deve ser maior ou igual a zero")
	.optional()
	.or(z.nan().transform(() => undefined));
// Peso e dimensões viram obrigatórios só na publicação (publishRequirementIssues):
// rascunho salva sem eles; a loja só consome tools ativas, que passam pelo gate.
const optionalPositiveNumber = z
	.number()
	.positive("Deve ser maior que zero")
	.optional()
	.or(z.nan().transform(() => undefined));

export const toolVariantSchema = z.object({
	id: z.string().optional(),
	sku: z.string().min(1, "SKU obrigatório"),
	// Obrigatório só na publicação — rascunho pode não ter o código ainda.
	barcode: z.string().trim().max(128).optional().or(z.literal("")),
	voltage: z.enum(VOLTAGE_OPTIONS).optional().or(z.literal("")),
	priceAmount: z
		.number()
		.nonnegative("Preço não pode ser negativo")
		.optional()
		.or(z.nan().transform(() => undefined)),
	isDefault: z.boolean().default(false),
	sortOrder: z.number().int().min(0),
});
export type ToolVariantInput = z.infer<typeof toolVariantSchema>;

export const updateVariantSchema = z.object({
	variantId: z.string().min(1),
	sku: z.string().min(1).max(64).optional(),
	barcode: z.string().trim().min(1).max(128).optional(),
	voltage: z.enum(VOLTAGE_OPTIONS).nullable().optional(),
	priceAmount: z.number().nonnegative("Preço não pode ser negativo").optional(),
});

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const attributeValueInputSchema = z.object({
	valueText: z.string().nullable().optional(),
	valueNumeric: z.number().nullable().optional(),
	valueNumericMax: z.number().nullable().optional(),
	valueBool: z.boolean().nullable().optional(),
});
export type AttributeValueInput = z.infer<typeof attributeValueInputSchema>;

/**
 * Linha de variante que o usuário nunca tocou (estado inicial do editor):
 * SKU e barcode vazios, sem voltagem e sem preço digitado. Filtrada antes da
 * validação para que rascunho só-com-nome não esbarre em "SKU obrigatório".
 */
function isPristineVariant(row: unknown): boolean {
	if (typeof row !== "object" || row === null) {
		return false;
	}
	const v = row as Partial<ToolVariantInput>;
	const sku = typeof v.sku === "string" ? v.sku.trim() : "";
	const barcode = typeof v.barcode === "string" ? v.barcode.trim() : "";
	const price =
		typeof v.priceAmount === "number" && !Number.isNaN(v.priceAmount)
			? v.priceAmount
			: 0;
	return sku === "" && barcode === "" && !v.voltage && price === 0 && !v.id;
}

function checkVariantDuplicates(
	variants: ToolVariantInput[],
	ctx: z.RefinementCtx
) {
	const skus = new Set<string>();
	for (let i = 0; i < variants.length; i++) {
		const sku = variants[i]?.sku;
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
	const barcodes = new Set<string>();
	for (let i = 0; i < variants.length; i++) {
		const code = variants[i]?.barcode;
		if (code && barcodes.has(code)) {
			ctx.addIssue({
				code: "custom",
				path: ["variants", i, "barcode"],
				message: "Código de barras duplicado entre variantes",
			});
		}
		if (code) {
			barcodes.add(code);
		}
	}
}

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
		weightKg: optionalPositiveNumber,
		lengthCm: optionalPositiveNumber,
		widthCm: optionalPositiveNumber,
		heightCm: optionalPositiveNumber,
		// Embalagem & envio — insumos do packItems no checkout (Frenet).
		packagingWeightKg: z
			.number()
			.nonnegative("Deve ser maior ou igual a zero")
			.optional()
			.or(z.nan().transform(() => undefined))
			.transform((v) => v ?? 0),
		stackable: z.boolean().default(true),
		shipsInOwnBox: z.boolean().default(false),
		// Categorias e variantes são exigências de publicação, não estruturais —
		// rascunho salva só com nome (ver publishRequirementIssues).
		categoryIds: z.array(z.string().min(1)),
		primaryCategoryId: optionalString.default(""),
		visibleOnSite: z.boolean().default(true),
		images: z
			.array(toolImageSchema)
			.max(MAX_IMAGES, `Máximo de ${MAX_IMAGES} imagens`),
		// A linha pristine do editor (SKU e barcode vazios, sem preço) não conta —
		// senão "salvar rascunho só com nome" tropeça no "SKU obrigatório" da
		// linha inicial que o usuário nunca tocou.
		variants: z.preprocess(
			(v) =>
				Array.isArray(v) ? v.filter((row) => !isPristineVariant(row)) : v,
			z.array(toolVariantSchema)
		),
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
		// Estrutural só quando há principal: exigir principal em si é regra de
		// publicação (publishRequirementIssues), não de rascunho.
		if (
			data.primaryCategoryId !== "" &&
			!data.categoryIds.includes(data.primaryCategoryId)
		) {
			ctx.addIssue({
				code: "custom",
				path: ["primaryCategoryId"],
				message: "A categoria principal deve estar selecionada",
			});
		}
		const defaults = data.variants.filter((v) => v.isDefault);
		if (data.variants.length > 0 && defaults.length !== 1) {
			ctx.addIssue({
				code: "custom",
				path: ["variants"],
				message: "Marque exatamente uma variante como padrão",
			});
		}
		checkVariantDuplicates(data.variants, ctx);
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

/**
 * A régua de ativação (specs/imagens) é um gate de TRANSIÇÃO: só vale quando
 * o tool ENTRA em `active` (create já-active ou draft/discontinued→active).
 * Editar um tool que já era `active` não re-valida — evita aprisionar edições
 * não relacionadas (issue #290). No create, passe `initialStatus = "draft"`.
 */
export function shouldEnforceActivation(
	currentStatus: ToolStatusValue,
	initialStatus: ToolStatusValue
): boolean {
	return currentStatus === "active" && initialStatus !== "active";
}

export interface ActivationIssue {
	message: string;
	path: (keyof ToolFormValues)[];
}

/**
 * Requisitos que um tool precisa cumprir para ESTAR em `active`. Não checa
 * `status` — o caller aplica só na transição para active (create já-active ou
 * draft→active). Espelha o que antes vivia no superRefine.
 */
export function activationRequirementIssues(
	data: ToolFormValues
): ActivationIssue[] {
	const issues: ActivationIssue[] = [];
	if (data.images.length < MIN_IMAGES_ACTIVE) {
		issues.push({
			path: ["images"],
			message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
		});
	}
	// NCM saiu da régua em 2026-07-28 (emenda ao ADR-0027): a emissão de NF-e
	// ainda não existe e o gate só forçava dado inventado. Religar quando a
	// emissão fiscal for real.
	if (
		countFilledSpecs(data.attributeValues, data.attributeAssignments) <
		MIN_SPECS_ACTIVE
	) {
		issues.push({
			path: ["attributeValues"],
			message: `Ativar exige ao menos ${MIN_SPECS_ACTIVE} especificações preenchidas. Se a categoria tiver poucos atributos, anexe atributos extras do catálogo.`,
		});
	}
	return issues;
}

/**
 * Campos que um tool ativo não pode ficar sem — dados que a loja consome
 * (frete, preço, catálogo). Diferente da régua de ativação (transição-only,
 * #290), vale SEMPRE que o status salvo é `active`: todo tool ativo tem esses
 * dados, então nunca aprisiona edição — só impede removê-los de um tool ativo.
 * Rascunho ignora tudo isto (só exige nome, no schema).
 */
export function publishRequirementIssues(
	data: ToolFormValues
): ActivationIssue[] {
	const issues: ActivationIssue[] = [];
	const missingShipping = (
		["weightKg", "lengthCm", "widthCm", "heightCm"] as const
	).filter((f) => data[f] === undefined);
	for (const field of missingShipping) {
		issues.push({
			path: [field],
			message: "Obrigatório para ativar — a loja usa para cotar frete",
		});
	}
	if (data.categoryIds.length < 1) {
		issues.push({
			path: ["categoryIds"],
			message: "Ativar exige ao menos uma categoria",
		});
	}
	if (data.primaryCategoryId === "") {
		issues.push({
			path: ["primaryCategoryId"],
			message: "Ativar exige uma categoria principal",
		});
	}
	if (data.variants.length < 1) {
		issues.push({
			path: ["variants"],
			message: "Ativar exige ao menos uma variante",
		});
	} else {
		const missingBarcode = data.variants.some((v) => !v.barcode?.trim());
		if (missingBarcode) {
			issues.push({
				path: ["variants"],
				message: "Ativar exige código de barras em todas as variantes",
			});
		}
		const missingPrice = data.variants.some((v) => v.priceAmount === undefined);
		if (missingPrice) {
			issues.push({
				path: ["variants"],
				message: "Ativar exige preço em todas as variantes",
			});
		}
	}
	return issues;
}

export interface ToolIssue {
	message: string;
	path: PropertyKey[];
}

/**
 * Superfície única de validação do form: invariantes estruturais (schema) +
 * requisitos de publicação quando o status salvo é `active` + régua de
 * ativação quando `enforceActivation` (transição). Consumido pelo submit e
 * pelos badges/erros por passo do wizard.
 */
export function collectToolIssues(
	values: unknown,
	opts: { enforceActivation: boolean }
): ToolIssue[] {
	const parsed = toolFormSchema.safeParse(values);
	if (!parsed.success) {
		return parsed.error.issues.map((i) => ({
			path: [...i.path],
			message: i.message,
		}));
	}
	const issues: ToolIssue[] = [];
	if (parsed.data.status === "active") {
		issues.push(...publishRequirementIssues(parsed.data));
	}
	if (opts.enforceActivation) {
		issues.push(...activationRequirementIssues(parsed.data));
	}
	return issues.map((i) => ({ path: [...i.path], message: i.message }));
}

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
