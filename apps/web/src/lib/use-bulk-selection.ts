"use client";

import { useEffect, useRef, useState } from "react";

interface UseBulkSelectionProps<T> {
	getId: (item: T) => string;
	items: T[];
	/** Quando muda (filtro/busca), a seleção é limpa — o modo permanece. */
	resetKey?: string;
}

/**
 * Estado de seleção em massa para listagens. Espelha o ciclo do useInfiniteList:
 * recebe os items carregados e limpa a seleção quando o resetKey muda. Agnóstico
 * de listagem — qualquer card-grid pode usar passando items + getId.
 */
export function useBulkSelection<T>({
	items,
	getId,
	resetKey,
}: UseBulkSelectionProps<T>) {
	const [active, setActive] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const lastResetKey = useRef(resetKey);

	useEffect(() => {
		if (resetKey === lastResetKey.current) {
			return;
		}
		lastResetKey.current = resetKey;
		setSelected(new Set());
	}, [resetKey]);

	function enter() {
		setActive(true);
	}

	function exit() {
		setActive(false);
		setSelected(new Set());
	}

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function clear() {
		setSelected(new Set());
	}

	function selectAllLoaded() {
		setSelected(new Set(items.map(getId)));
	}

	function isSelected(id: string) {
		return selected.has(id);
	}

	const allLoadedSelected =
		items.length > 0 && items.every((item) => selected.has(getId(item)));

	return {
		active,
		allLoadedSelected,
		clear,
		count: selected.size,
		enter,
		exit,
		isSelected,
		selectAllLoaded,
		selectedIds: Array.from(selected),
		toggle,
	};
}
