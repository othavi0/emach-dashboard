"use client";

import { Button } from "@emach/ui/components/button";
import { Loader2 } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

interface InfiniteSentinelProps {
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
	root?: RefObject<HTMLElement | null>;
	/** Placeholder opcional exibido durante o carregamento (ex: grid de skeleton cards). Default: spinner discreto. */
	skeleton?: ReactNode;
}

export function InfiniteSentinel({
	hasMore,
	pending,
	error,
	onLoadMore,
	root,
	skeleton,
}: InfiniteSentinelProps) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!hasMore || pending || error) {
			return;
		}
		const el = ref.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					onLoadMore();
				}
			},
			{ root: root?.current ?? null, rootMargin: "200px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, pending, error, onLoadMore, root]);

	if (error) {
		return (
			<div className="flex flex-col items-center gap-2 py-6">
				<p className="text-destructive text-xs">{error}</p>
				<Button onClick={onLoadMore} size="sm" variant="outline">
					Tentar de novo
				</Button>
			</div>
		);
	}

	if (!hasMore) {
		return null;
	}

	if (pending) {
		return (
			<div className="py-6">
				{skeleton ?? (
					<div className="flex items-center justify-center">
						<Loader2
							aria-label="Carregando mais itens"
							className="size-4 animate-spin text-muted-foreground"
						/>
					</div>
				)}
			</div>
		);
	}

	// Alvo do IntersectionObserver: dispara o auto-load ao entrar na viewport.
	return <div aria-hidden className="h-px w-full" ref={ref} />;
}
