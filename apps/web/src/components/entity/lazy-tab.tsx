"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

export type LazyTabStatus = "loading" | "error" | "ready";

const LazyTabReloadContext = createContext<() => void>(() => {
	// no-op fora do provider (ex: componente usado fora de tab lazy)
});

/**
 * Re-dispara o fetch do LazyTab que envolve o componente. Mutações dentro de
 * tabs lazy chamam após sucesso — router.refresh() atualiza props do server,
 * mas não o dado buscado pelo loader (ADR-0024).
 */
export function useLazyTabReload(): () => void {
	return useContext(LazyTabReloadContext);
}

interface LazyTabState<T> {
	attempt: number;
	data: T | null;
	key: string | undefined;
	status: LazyTabStatus;
}

export function useLazyTab<T>(
	load: () => Promise<T>,
	reloadKey?: string
): {
	status: LazyTabStatus;
	data: T | null;
	retry: () => void;
} {
	const [state, setState] = useState<LazyTabState<T>>({
		attempt: 0,
		data: null,
		key: reloadKey,
		status: "loading",
	});
	const loadRef = useRef(load);
	useEffect(() => {
		loadRef.current = load;
	});

	// reloadKey: refaz o fetch quando dados externos ao shell mudam (ex: filtros
	// lidos de useSearchParams) — sem ele o dado congela no primeiro attempt e a
	// tab deixa de reagir a filtros trocados após a ativação (review do #261).
	// Reset síncrono durante o render (padrão "adjusting state when a prop
	// changes"); o effect abaixo refaz o fetch ao ver o reloadKey novo.
	if (state.key !== reloadKey) {
		setState((s) => ({ ...s, data: null, key: reloadKey, status: "loading" }));
	}

	useEffect(() => {
		let active = true;
		loadRef
			.current()
			.then((result) => {
				if (active) {
					setState((s) => ({ ...s, data: result, status: "ready" }));
				}
			})
			.catch(() => {
				if (active) {
					setState((s) => ({ ...s, status: "error" }));
				}
			});
		return () => {
			active = false;
		};
	}, [state.attempt, reloadKey]);

	return {
		status: state.status,
		data: state.data,
		retry: () =>
			setState((s) => ({
				...s,
				attempt: s.attempt + 1,
				data: null,
				status: "loading",
			})),
	};
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
		<LazyTabReloadContext.Provider value={retry}>
			<LazyTabView
				data={data}
				onRetry={retry}
				skeleton={skeleton}
				status={status}
			>
				{children}
			</LazyTabView>
		</LazyTabReloadContext.Provider>
	);
}
