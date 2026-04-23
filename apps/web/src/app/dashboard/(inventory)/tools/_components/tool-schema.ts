import { z } from "zod";

export const VOLTAGE_OPTIONS = ["127V", "220V", "Bivolt", "380V"] as const;
export const TOOL_STATUS_OPTIONS = [
	"draft",
	"active",
	"discontinued",
	"out_of_stock",
] as const;

export const TOOL_STATUS_LABELS: Record<
	(typeof TOOL_STATUS_OPTIONS)[number],
	string
> = {
	draft: "Rascunho",
	active: "Ativo",
	discontinued: "Descontinuado",
	out_of_stock: "Sem estoque",
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

export const toolFormSchema = z
	.object({
		name: z.string().min(1, "Nome obrigatório"),
		description: optionalString,
		sku: z.string().min(1, "SKU obrigatório"),
		model: optionalString,
		invoiceModel: optionalString,
		barcode: optionalString,
		manufacturerName: optionalString,
		countryOfOrigin: optionalString,
		status: z.enum(TOOL_STATUS_OPTIONS).default("draft"),
		hsCode: optionalString,
		ncm: optionalString,
		cest: optionalString,
		voltage: z.enum(VOLTAGE_OPTIONS).optional().or(z.literal("")),
		powerWatts: optionalInt,
		frequencyHz: optionalInt,
		warrantyMonths: optionalInt,
		weightKg: optionalNumber,
		lengthCm: optionalNumber,
		widthCm: optionalNumber,
		heightCm: optionalNumber,
		price: optionalNumber,
		cost: optionalNumber,
		productTypeId: z.string().min(1, "Tipo de produto obrigatório"),
		supplierId: optionalString,
		visibleOnSite: z.boolean().default(true),
		images: z.array(toolImageSchema).max(MAX_IMAGES, `Máximo de ${MAX_IMAGES} imagens`),
	})
	.superRefine((data, ctx) => {
		if (data.status === "active" && data.images.length < MIN_IMAGES_ACTIVE) {
			ctx.addIssue({
				code: "custom",
				path: ["images"],
				message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
			});
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
