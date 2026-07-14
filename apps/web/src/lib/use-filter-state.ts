"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 300;

function buildUrl(basePath: string, params: URLSearchParams): string {
	const qs = params.toString();
	return qs ? `${basePath}?${qs}` : basePath;
}

interface FilterStateOptions {
	basePath: string;
	trackedKeys?: readonly string[];
}

interface FilterStateApi {
	clearAll: () => void;
	hasActive: boolean;
	searchParams: URLSearchParams;
	setParam: (key: string, value: string | null) => void;
}

export function useFilterState({
	basePath,
	trackedKeys,
}: FilterStateOptions): FilterStateApi {
	const router = useRouter();
	const searchParams = useSearchParams();

	const setParam = useCallback(
		(key: string, value: string | null) => {
			const next = new URLSearchParams(searchParams.toString());
			if (value && value.length > 0) {
				next.set(key, value);
			} else {
				next.delete(key);
			}
			router.replace(buildUrl(basePath, next));
		},
		[basePath, router, searchParams]
	);

	const clearAll = useCallback(() => {
		if (!trackedKeys || trackedKeys.length === 0) {
			router.replace(basePath);
			return;
		}
		const next = new URLSearchParams(searchParams.toString());
		for (const key of trackedKeys) {
			next.delete(key);
		}
		router.replace(buildUrl(basePath, next));
	}, [basePath, router, searchParams, trackedKeys]);

	const keys = trackedKeys ?? Array.from(searchParams.keys());
	const hasActive = keys.some((key) => {
		const v = searchParams.get(key);
		return v !== null && v !== "";
	});

	return { searchParams, setParam, clearAll, hasActive };
}

interface DebouncedParamOptions {
	basePath: string;
	debounceMs?: number;
	key: string;
}

export function useDebouncedParam({
	basePath,
	key,
	debounceMs = DEFAULT_DEBOUNCE_MS,
}: DebouncedParamOptions): readonly [string, (value: string) => void] {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlValue = searchParams.get(key) ?? "";
	const [local, setLocal] = useState(urlValue);

	// Re-sincroniza o input quando a URL muda por fora (back/forward, limpar
	// filtros) — durante o render, sem o re-render extra do effect.
	const [lastUrlValue, setLastUrlValue] = useState(urlValue);
	if (lastUrlValue !== urlValue) {
		setLastUrlValue(urlValue);
		setLocal(urlValue);
	}

	useEffect(() => {
		if (local === urlValue) {
			return;
		}
		const handle = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (local) {
				next.set(key, local);
			} else {
				next.delete(key);
			}
			router.replace(buildUrl(basePath, next));
		}, debounceMs);
		return () => clearTimeout(handle);
	}, [basePath, debounceMs, key, local, router, searchParams, urlValue]);

	return [local, setLocal] as const;
}
