import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { type ToolFormValues, toolFormSchema } from "./tool-schema";

export type ToolStepId =
	| "identity"
	| "variants"
	| "specs"
	| "logistics"
	| "fiscal"
	| "publish";

export interface ToolStep {
	description: string;
	id: ToolStepId;
	label: string;
	optional?: boolean;
}

export const TOOL_STEPS: ToolStep[] = [
	{
		id: "identity",
		label: "Identidade & categoria",
		description: "Nome, descrição, categorias e fornecedor",
	},
	{
		id: "variants",
		label: "Variantes & preço",
		description: "SKUs vendáveis, voltagem, preço e custo",
	},
	{
		id: "specs",
		label: "Especificações",
		description: "Atributos técnicos da categoria principal",
	},
	{
		id: "logistics",
		label: "Logística & frete",
		description: "Peso, dimensões, potência e frete",
	},
	{
		id: "fiscal",
		label: "Fiscal",
		description: "Modelos, marca e códigos fiscais",
		optional: true,
	},
	{
		id: "publish",
		label: "Imagens & publicação",
		description: "Galeria, status e visibilidade",
	},
];

export const STEP_FIELDS: Record<ToolStepId, (keyof ToolFormValues)[]> = {
	identity: [
		"name",
		"description",
		"categoryIds",
		"primaryCategoryId",
		"supplierId",
	],
	variants: ["variants"],
	specs: ["attributeAssignments", "attributeValues"],
	logistics: [
		"weightKg",
		"lengthCm",
		"widthCm",
		"heightCm",
		"powerWatts",
		"overweightShippingAmount",
	],
	fiscal: [
		"model",
		"invoiceModel",
		"manufacturerName",
		"ncm",
		"cest",
		"hsCode",
	],
	publish: ["images", "status", "visibleOnSite"],
};

export const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	description: "Descrição",
	model: "Modelo comercial",
	invoiceModel: "Modelo da fábrica",
	manufacturerName: "Marca / fabricante",
	status: "Status",
	hsCode: "HS Code",
	ncm: "NCM",
	cest: "CEST",
	powerWatts: "Potência (W)",
	weightKg: "Peso (kg)",
	lengthCm: "Comprimento (cm)",
	widthCm: "Largura (cm)",
	heightCm: "Altura (cm)",
	categoryIds: "Categorias",
	primaryCategoryId: "Categoria principal",
	supplierId: "Fornecedor",
	visibleOnSite: "Visível no site",
	images: "Imagens",
	variants: "Variantes",
	attributeValues: "Especificações técnicas",
	attributeAssignments: "Atributos vinculados",
	overweightShippingAmount: "Sobretaxa de frete",
};

export function getStepIssues(
	values: unknown,
	stepId: ToolStepId
): FormIssue[] {
	const result = toolFormSchema.safeParse(values);
	if (result.success) {
		return [];
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const scoped = result.error.issues.filter(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
	if (scoped.length === 0) {
		return [];
	}
	return zodIssuesToFormIssues(
		{ issues: scoped } as Parameters<typeof zodIssuesToFormIssues>[0],
		FIELD_LABELS
	);
}
