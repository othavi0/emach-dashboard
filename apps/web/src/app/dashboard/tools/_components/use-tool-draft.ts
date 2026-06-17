"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	DRAFT_KEY,
	parseDraft,
	serializeDraft,
	shouldPersist,
} from "./tool-draft-storage";
import { EMPTY_TOOL_VALUES, type ToolFormState } from "./tool-form-state";

interface UseToolDraftArgs {
	onRestore?: (restored: ToolFormState) => void;
	setValues: (v: ToolFormState) => void;
	values: ToolFormState;
}

export function useToolDraft({
	values,
	setValues,
	onRestore,
}: UseToolDraftArgs) {
	const [recovered, setRecovered] = useState(false);
	const hydrated = useRef(false);

	// Restore pós-mount: ler localStorage só depois da hidratação evita mismatch.
	useEffect(() => {
		if (hydrated.current) {
			return;
		}
		hydrated.current = true;
		const draft = parseDraft(localStorage.getItem(DRAFT_KEY), Date.now());
		if (draft) {
			setValues(draft);
			setRecovered(true);
			onRestore?.(draft);
		} else {
			localStorage.removeItem(DRAFT_KEY);
		}
	}, [setValues, onRestore]);

	// Autosave debounced (~500ms). Só após hidratar e só se houver conteúdo.
	useEffect(() => {
		if (!(hydrated.current && shouldPersist(values))) {
			return;
		}
		const t = setTimeout(() => {
			localStorage.setItem(DRAFT_KEY, serializeDraft(values, Date.now()));
		}, 500);
		return () => clearTimeout(t);
	}, [values]);

	const discard = useCallback(() => {
		localStorage.removeItem(DRAFT_KEY);
		setValues(EMPTY_TOOL_VALUES);
		setRecovered(false);
	}, [setValues]);

	const clear = useCallback(() => {
		localStorage.removeItem(DRAFT_KEY);
	}, []);

	return { clear, discard, recovered };
}
