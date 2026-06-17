import type { ToolFormState } from "./tool-form-state";
import { stepsWithContent } from "./tool-form-steps";

export const DRAFT_KEY = "emach:tool-draft:new:v1";
export const DRAFT_TTL_MS = 86_400_000; // 24h

interface StoredDraft {
	data: ToolFormState;
	savedAt: number;
}

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
		const parsed = JSON.parse(raw) as Partial<StoredDraft>;
		if (typeof parsed?.savedAt !== "number" || !parsed.data) {
			return null;
		}
		if (now - parsed.savedAt > DRAFT_TTL_MS) {
			return null;
		}
		return parsed.data;
	} catch {
		// rascunho corrompido → ignora (decisão consciente: parse defensivo)
		return null;
	}
}

export function shouldPersist(values: ToolFormState): boolean {
	return stepsWithContent(values).size > 0;
}
