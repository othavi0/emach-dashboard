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

export const STEP_FIELDS = {
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
} satisfies Record<ToolStepId, (keyof ToolFormValues)[]>;

// Garante em tempo de compilação que todo campo do schema está coberto por algum
// passo. Um campo `required` novo que não entre em STEP_FIELDS deixaria de
// bloquear qualquer passo (só pegaria no submit final) — aqui quebra o build.
type _UncoveredField = Exclude<
	keyof ToolFormValues,
	(typeof STEP_FIELDS)[ToolStepId][number]
>;
const _stepFieldsAreExhaustive: _UncoveredField extends never
	? true
	: ["faltam campos em STEP_FIELDS:", _UncoveredField] = true;
void _stepFieldsAreExhaustive;

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

export function filterStepIssues(
	result: ReturnType<typeof toolFormSchema.safeParse>,
	stepId: ToolStepId
): FormIssue[] {
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

export function stepHasErrors(
	result: ReturnType<typeof toolFormSchema.safeParse>,
	stepId: ToolStepId
): boolean {
	if (result.success) {
		return false;
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	return result.error.issues.some(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
}

export function getStepIssues(
	values: unknown,
	stepId: ToolStepId
): FormIssue[] {
	return filterStepIssues(toolFormSchema.safeParse(values), stepId);
}
