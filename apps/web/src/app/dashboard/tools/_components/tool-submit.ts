"use client";

import type { ZodError } from "zod";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { createTool, updateTool } from "../actions";
import type { ToolFormState } from "./tool-form-state";
import { type ToolFormValues, toolFormSchema } from "./tool-schema";

const FIELD_LABELS: Record<string, string> = {
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
};

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
	return mode === "create" ? createTool(data) : updateTool(toolId ?? "", data);
}
