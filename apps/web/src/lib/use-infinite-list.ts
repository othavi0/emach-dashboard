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

	if (resetKey !== lastResetKey.current) {
		lastResetKey.current = resetKey;
		setItems(initialItems);
		setCursor(initialCursor);
		setError(null);
	}

	const loadMore = useCallback(() => {
		if (!cursor || pending) {
			return;
		}
		startTransition(async () => {
			try {
				const next = await fetchPage(cursor);
				setItems((prev) => [...prev, ...next.items]);
				setCursor(next.nextCursor);
			} catch {
				setError("Falha ao carregar mais. Tente novamente.");
			}
		});
	}, [cursor, pending, fetchPage]);

	return {
		items,
		hasMore: cursor !== null,
		loadMore,
		pending,
		error,
	};
}
