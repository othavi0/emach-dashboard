import { z } from "zod";
import { EMPTY_TOOL_VALUES, type ToolFormState } from "./tool-form-state";
import { stepsWithContent } from "./tool-form-steps";
import {
	attributeValueInputSchema,
	TOOL_STATUS_OPTIONS,
	VOLTAGE_OPTIONS,
} from "./tool-schema";

export const DRAFT_KEY = "emach:tool-draft:new:v1";
export const DRAFT_TTL_MS = 86_400_000; // 24h

interface StoredDraft {
	data: ToolFormState;
	savedAt: number;
}

// JSON.stringify grava NaN como null; no form, número vazio é undefined.
const draftNumber = z
	.number()
	.nullish()
	.transform((v) => v ?? undefined);

// Só o formato do ToolFormState, sem as regras do toolFormSchema: rascunho
// guarda form pela metade (SKU vazio, URL ainda não enviada).
const draftVariantSchema = z.object({
	id: z.string().optional(),
	sku: z.string(),
	barcode: z.string().optional(),
	voltage: z.enum(VOLTAGE_OPTIONS).or(z.literal("")).optional(),
	priceAmount: draftNumber,
	isDefault: z.boolean(),
	// Rascunho gravado antes do #441 não tem o campo.
	visibleOnSite: z.boolean().default(true),
	sortOrder: z.number(),
});

const draftImageSchema = z.object({
	id: z.string().optional(),
	url: z.string(),
	sortOrder: z.number(),
});

// Partial porque rascunho gravado por versão anterior do form pode não ter
// campo novo; o que falta cai no EMPTY_TOOL_VALUES em parseDraft.
const draftDataSchema = z
	.object({
		name: z.string(),
		description: z.string().optional(),
		model: z.string().optional(),
		invoiceModel: z.string().optional(),
		manufacturerName: z.string().optional(),
		status: z.enum(TOOL_STATUS_OPTIONS),
		hsCode: z.string().optional(),
		ncm: z.string().optional(),
		cest: z.string().optional(),
		powerWatts: draftNumber,
		weightKg: draftNumber,
		lengthCm: draftNumber,
		widthCm: draftNumber,
		heightCm: draftNumber,
		packagingWeightKg: draftNumber,
		stackable: z.boolean(),
		shipsInOwnBox: z.boolean(),
		categoryIds: z.array(z.string()),
		primaryCategoryId: z.string(),
		visibleOnSite: z.boolean(),
		images: z.array(draftImageSchema),
		videoUrl: z.string().nullable(),
		videoPosterUrl: z.string().nullable(),
		variants: z.array(draftVariantSchema),
		attributeValues: z.record(z.string(), attributeValueInputSchema),
		attributeAssignments: z.array(z.string()),
	})
	.partial();

const storedDraftSchema = z.object({
	savedAt: z.number(),
	data: draftDataSchema,
});

export function serializeDraft(data: ToolFormState, now: number): string {
	return JSON.stringify({ data, savedAt: now } satisfies StoredDraft);
}

export function parseDraft(
	raw: string | null,
	now: number
): ToolFormState | null {
	if (!raw) {
		return null;
	}

	try {
		const parsed = storedDraftSchema.safeParse(JSON.parse(raw));

		if (!parsed.success) {
			return null;
		}

		if (now - parsed.data.savedAt > DRAFT_TTL_MS) {
			return null;
		}

		return { ...EMPTY_TOOL_VALUES, ...parsed.data.data };
	} catch {
		// rascunho corrompido → ignora (decisão consciente: parse defensivo)
		return null;
	}
}

export function shouldPersist(values: ToolFormState): boolean {
	return stepsWithContent(values).size > 0;
}
