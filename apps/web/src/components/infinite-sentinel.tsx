"use client";

import { Button } from "@emach/ui/components/button";
import { useEffect, useRef } from "react";

interface InfiniteSentinelProps {
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
}

export function InfiniteSentinel({
	hasMore,
	pending,
	error,
	onLoadMore,
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
			{ rootMargin: "200px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, pending, error, onLoadMore]);

	if (!hasMore) {
		return (
			<p className="py-8 text-center text-muted-foreground text-xs">
				— fim da lista —
			</p>
		);
	}

	return (
		<div className="flex flex-col items-center gap-2 py-6" ref={ref}>
			{pending && <p className="text-muted-foreground text-xs">Carregando…</p>}
			{error && (
				<>
					<p className="text-destructive text-xs">{error}</p>
					<Button onClick={onLoadMore} size="sm" variant="outline">
						Tentar de novo
					</Button>
				</>
			)}
			<Button disabled={pending} onClick={onLoadMore} size="sm" variant="ghost">
				Carregar mais
			</Button>
		</div>
	);
}
