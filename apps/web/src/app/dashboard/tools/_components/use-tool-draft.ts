"use client";

import { useEffect, useRef, useState } from "react";
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
	// Ref para cancelar o timer pendente do autosave antes de removeItem.
	// Sem isso, um timeout em voo dispara após discard() e ressuscita o rascunho.
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Restore pós-mount: ler localStorage só depois da hidratação evita mismatch.
	useEffect(() => {
		if (hydrated.current) {
			return;
		}
		hydrated.current = true;
		const draft = parseDraft(localStorage.getItem(DRAFT_KEY), Date.now());
		if (draft) {
			// Merge defensivo: garante defaults de EMPTY_TOOL_VALUES para campos
			// ausentes (ex: draft gravado numa versão anterior do schema).
			setValues({ ...EMPTY_TOOL_VALUES, ...draft });
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
			try {
				localStorage.setItem(DRAFT_KEY, serializeDraft(values, Date.now()));
			} catch {
				// localStorage indisponível (iframe sandboxed, modo privado bloqueado)
			}
		}, 500);
		timerRef.current = t;
		return () => {
			clearTimeout(t);
			timerRef.current = null;
		};
	}, [values]);

	// Cancela o timer pendente antes de limpar o storage para evitar race.
	function cancelPendingTimer() {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}

	function discard() {
		cancelPendingTimer();
		try {
			localStorage.removeItem(DRAFT_KEY);
		} catch {
			// storage bloqueado — ignorar; estado React ainda reseta
		}
		setValues(EMPTY_TOOL_VALUES);
		setRecovered(false);
	}

	function clear() {
		cancelPendingTimer();
		try {
			localStorage.removeItem(DRAFT_KEY);
		} catch {
			// storage bloqueado — rascunho expira via TTL na próxima visita
		}
	}

	return { clear, discard, recovered };
}
