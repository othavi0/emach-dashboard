import { EMPTY_TOOL_VALUES, type ToolFormState } from "./tool-form-state";
import {
	collectToolIssues,
	type ToolFormValues,
	type ToolIssue,
} from "./tool-schema";

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
		description: "Nome, descrição e categorias",
	},
	{
		id: "variants",
		label: "Variantes & preço",
		description: "SKUs vendáveis, códigos de barras, voltagem e preço",
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
	identity: ["name", "description", "categoryIds", "primaryCategoryId"],
	variants: ["variants"],
	specs: ["attributeAssignments", "attributeValues"],
	logistics: [
		"weightKg",
		"lengthCm",
		"widthCm",
		"heightCm",
		"powerWatts",
		"packagingWeightKg",
		"stackable",
		"shipsInOwnBox",
	],
	fiscal: [
		"model",
		"invoiceModel",
		"manufacturerName",
		"ncm",
		"cest",
		"hsCode",
	],
	publish: ["images", "status", "visibleOnSite", "videoUrl", "videoPosterUrl"],
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

export type { _stepFieldsAreExhaustive as _ };

export function stepHasErrors(
	issues: ToolIssue[],
	stepId: ToolStepId
): boolean {
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	return issues.some(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
}

export function getStepFieldErrors(
	values: unknown,
	stepId: ToolStepId,
	enforceActivation: boolean
): Partial<Record<keyof ToolFormValues, string>> {
	const issues = collectToolIssues(values, { enforceActivation });
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const out: Partial<Record<keyof ToolFormValues, string>> = {};
	for (const issue of issues) {
		const key = issue.path[0] as keyof ToolFormValues | undefined;
		if (key && fields.has(String(key)) && out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out;
}

export function firstStepWithError(
	values: unknown,
	enforceActivation: boolean
): ToolStepId | null {
	const issues = collectToolIssues(values, { enforceActivation });
	if (issues.length === 0) {
		return null;
	}
	for (const step of TOOL_STEPS) {
		if (stepHasErrors(issues, step.id)) {
			return step.id;
		}
	}
	return null;
}

export function getStepErrorCount(
	issues: ToolIssue[],
	stepId: ToolStepId
): number {
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const seen = new Set<string>();
	for (const issue of issues) {
		if (issue.path.length > 0 && fields.has(String(issue.path[0]))) {
			seen.add(String(issue.path[0]));
		}
	}
	return seen.size;
}

export function stepsWithContent(values: ToolFormState): Set<ToolStepId> {
	const result = new Set<ToolStepId>();
	for (const step of TOOL_STEPS) {
		const fields = STEP_FIELDS[step.id] as (keyof ToolFormState)[];
		const differs = fields.some(
			(f) => JSON.stringify(values[f]) !== JSON.stringify(EMPTY_TOOL_VALUES[f])
		);
		if (differs) {
			result.add(step.id);
		}
	}
	return result;
}
