"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type LazyTabStatus = "loading" | "error" | "ready";

export function useLazyTab<T>(
	load: () => Promise<T>,
	reloadKey?: string
): {
	status: LazyTabStatus;
	data: T | null;
	retry: () => void;
} {
	const [status, setStatus] = useState<LazyTabStatus>("loading");
	const [data, setData] = useState<T | null>(null);
	const [attempt, setAttempt] = useState(0);
	const loadRef = useRef(load);
	loadRef.current = load;

	// reloadKey: refaz o fetch quando dados externos ao shell mudam (ex: filtros
	// lidos de useSearchParams) — sem ele o dado congela no primeiro attempt e a
	// tab deixa de reagir a filtros trocados após a ativação (review do #261).
	useEffect(() => {
		let active = true;
		setStatus("loading");
		setData(null);
		loadRef
			.current()
			.then((result) => {
				if (active) {
					setData(result);
					setStatus("ready");
				}
			})
			.catch(() => {
				if (active) {
					setStatus("error");
				}
			});
		return () => {
			active = false;
		};
	}, [attempt, reloadKey]);

	return { status, data, retry: () => setAttempt((a) => a + 1) };
}

interface ViewProps<T> {
	children: (data: T) => ReactNode;
	data: T | null;
	onRetry: () => void;
	skeleton?: ReactNode;
	status: LazyTabStatus;
}

export function LazyTabView<T>({
	status,
	data,
	onRetry,
	skeleton,
	children,
}: ViewProps<T>): ReactNode {
	if (status === "error") {
		return (
			<Alert variant="destructive">
				<AlertDescription className="flex items-center justify-between gap-3">
					<span>Não foi possível carregar.</span>
					<Button onClick={onRetry} size="sm" variant="outline">
						Tentar novamente
					</Button>
				</AlertDescription>
			</Alert>
		);
	}
	if (status === "loading" || data === null) {
		return (
			skeleton ?? (
				<div
					aria-busy="true"
					className="h-32 animate-pulse rounded-md bg-muted"
				/>
			)
		);
	}
	return <>{children(data)}</>;
}

export function LazyTab<T>({
	load,
	reloadKey,
	skeleton,
	children,
}: {
	load: () => Promise<T>;
	reloadKey?: string;
	skeleton?: ReactNode;
	children: (data: T) => ReactNode;
}): ReactNode {
	const { status, data, retry } = useLazyTab(load, reloadKey);
	return (
		<LazyTabView
			data={data}
			onRetry={retry}
			skeleton={skeleton}
			status={status}
		>
			{children}
		</LazyTabView>
	);
}
