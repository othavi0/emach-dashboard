"use client";

import { useCallback, useRef, useState, useTransition } from "react";

import type { InfiniteResult } from "./infinite";

interface UseInfiniteListProps<T> {
	fetchPage: (cursor: string) => Promise<InfiniteResult<T>>;
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

	if (resetKey !== lastResetKey.current) {
		lastResetKey.current = resetKey;
		setItems(initialItems);
		setCursor(initialCursor);
		cursorRef.current = initialCursor;
		setError(null);
	}

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
			try {
				const next = await fetchPage(currentCursor);
				setItems((prev) => [...prev, ...next.items]);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
			} catch {
				setError("Falha ao carregar mais. Tente novamente.");
			} finally {
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
