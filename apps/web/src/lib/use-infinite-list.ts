"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

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
			try {
				const next = await fetchPage(null);
				if (mySeq !== refetchSeq.current) {
					return;
				}
				setItems(next.items);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
			} catch {
				if (mySeq === refetchSeq.current) {
					setError("Falha ao recarregar.");
				}
			} finally {
				if (mySeq === refetchSeq.current) {
					inflightRef.current = false;
				}
			}
		});
	}, [resetKey, fetchPage]);

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
