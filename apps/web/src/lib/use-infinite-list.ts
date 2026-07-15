"use client";

import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
	useTransition,
} from "react";

import type { InfiniteResult } from "./infinite";

interface UseInfiniteListProps<T> {
	fetchPage: (cursor: string | null) => Promise<InfiniteResult<T>>;
	initialCursor: string | null;
	initialItems: T[];
	resetKey?: string;
}

export function useInfiniteList<T>({
	initialItems,
	initialCursor,
	fetchPage,
	resetKey,
}: UseInfiniteListProps<T>) {
	const [items, setItems] = useState(initialItems);
	const [cursor, setCursor] = useState(initialCursor);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const lastResetKey = useRef(resetKey);
	const inflightRef = useRef(false);
	const cursorRef = useRef(initialCursor);
	const refetchSeq = useRef(0);

	// Estabiliza a closure inline recriada a cada render nos ~20 callsites.
	// useEffectEvent dá uma função estável que sempre chama a versão mais recente
	// de fetchPage — mantendo-o fora das deps do reset/loadMore sem editar
	// consumidor, sem effect com dep fresca e sem escrita de ref em render
	// (ambos re-firariam no-effect-with-fresh-deps / no-ref-current-in-render).
	const fetchPageEvent = useEffectEvent((cursor: string | null) =>
		fetchPage(cursor)
	);

	useEffect(() => {
		if (resetKey === lastResetKey.current) {
			return;
		}
		lastResetKey.current = resetKey;
		const mySeq = ++refetchSeq.current;
		setItems([]);
		setCursor(null);
		cursorRef.current = null;
		setError(null);
		inflightRef.current = true;
		startTransition(async () => {
			// Sem finally: React Compiler baila em try com finalizer.
			try {
				const next = await fetchPageEvent(null);
				if (mySeq !== refetchSeq.current) {
					return;
				}
				setItems(next.items);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
				inflightRef.current = false;
			} catch {
				if (mySeq === refetchSeq.current) {
					setError("Falha ao recarregar.");
					inflightRef.current = false;
				}
			}
		});
	}, [resetKey]);

	const removeItem = useCallback((predicate: (item: T) => boolean) => {
		setItems((prev) => prev.filter((item) => !predicate(item)));
	}, []);

	const loadMore = useCallback(() => {
		if (!cursorRef.current || inflightRef.current) {
			return;
		}
		const currentCursor = cursorRef.current;
		inflightRef.current = true;
		startTransition(async () => {
			// Sem finally: React Compiler baila em try com finalizer.
			try {
				const next = await fetchPage(currentCursor);
				setItems((prev) => [...prev, ...next.items]);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
				inflightRef.current = false;
			} catch {
				setError("Falha ao carregar mais. Tente novamente.");
				inflightRef.current = false;
			}
		});
	}, [fetchPage]);

	return {
		items,
		hasMore: cursor !== null,
		loadMore,
		pending,
		error,
		removeItem,
	};
}
