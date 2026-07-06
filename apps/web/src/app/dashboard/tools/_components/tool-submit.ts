"use client";

import { zodIssuesToFieldErrors } from "@/lib/form-errors";
import { createTool, updateTool } from "../actions";
import type { ToolFormState } from "./tool-form-state";
import {
	activationRequirementIssues,
	type ToolFormValues,
	toolFormSchema,
} from "./tool-schema";

export interface ParsedResult {
	data?: ToolFormValues;
	fieldErrors: Partial<Record<keyof ToolFormValues, string>>;
	ok: boolean;
}

export function parseToolForm(
	values: ToolFormState,
	opts: { enforceActivation: boolean }
): ParsedResult {
	const result = toolFormSchema.safeParse(values);
	if (!result.success) {
		return {
			ok: false,
			fieldErrors: zodIssuesToFieldErrors<ToolFormValues>(result.error),
		};
	}
	if (opts.enforceActivation) {
		const actIssues = activationRequirementIssues(result.data);
		if (actIssues.length > 0) {
			const fieldErrors: Partial<Record<keyof ToolFormValues, string>> = {};
			for (const issue of actIssues) {
				const key = issue.path[0];
				if (key !== undefined && fieldErrors[key] === undefined) {
					fieldErrors[key] = issue.message;
				}
			}
			return { ok: false, fieldErrors };
		}
	}
	return { ok: true, data: result.data, fieldErrors: {} };
}

export function persistTool(
	mode: "create" | "edit",
	data: ToolFormValues,
	toolId?: string
) {
	if (mode === "create") {
		return createTool(data);
	}
	// Guard: editar sem id seria um updateTool("") silencioso (no-op que toasta
	// sucesso). Falha alto — indica ToolFormProvider sem toolId em modo edição.
	if (!toolId) {
		throw new Error("persistTool: toolId obrigatório em modo edição");
	}
	return updateTool(toolId, data);
}
