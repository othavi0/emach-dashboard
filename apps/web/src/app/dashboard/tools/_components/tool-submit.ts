"use client";

import type { ZodError } from "zod";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { createTool, updateTool } from "../actions";
import type { ToolFormState } from "./tool-form-state";
import { FIELD_LABELS } from "./tool-form-steps";
import { type ToolFormValues, toolFormSchema } from "./tool-schema";

export interface ParsedResult {
	data?: ToolFormValues;
	fieldErrors: Partial<Record<keyof ToolFormValues, string>>;
	issues: FormIssue[];
	ok: boolean;
}

export function parseToolForm(values: ToolFormState): ParsedResult {
	const result = toolFormSchema.safeParse(values);
	if (result.success) {
		return { ok: true, data: result.data, fieldErrors: {}, issues: [] };
	}
	const err = result.error as ZodError<ToolFormValues>;
	const fieldErrors: Partial<Record<keyof ToolFormValues, string>> = {};
	for (const issue of err.issues) {
		const key = issue.path[0] as keyof ToolFormValues | undefined;
		if (key && !fieldErrors[key]) {
			fieldErrors[key] = issue.message;
		}
	}
	return {
		ok: false,
		fieldErrors,
		issues: zodIssuesToFormIssues(err, FIELD_LABELS),
	};
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
