"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { fetchVariantBranchMovementsPageAction } from "../actions";
import type { StockMovementRow } from "../movements-data";
import { STOCK_MOVEMENT_REASON_LABELS } from "./stock-movement-schema";

// ─── Helpers de data relativa ──────────────────────────────────────────────

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const absDays = Math.abs(diffMs) / 86_400_000;
	if (absDays < 1) {
		const absHours = Math.abs(diffMs) / 3_600_000;
		if (absHours < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(Math.round(diffMs / 3_600_000), "hour");
	}
	const diffDays = Math.round(diffMs / 86_400_000);
	if (absDays < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}

// ─── Movimento (linha) ───────────────────────────────────────────────────────

function MovementRow({ m }: { m: StockMovementRow }) {
	return (
		<li className="flex items-start gap-3 px-4 py-2.5 text-xs">
			<span
				className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
					m.delta >= 0
						? "bg-success/15 text-success"
						: "bg-destructive/15 text-destructive"
				}`}
			>
				{m.delta >= 0 ? "+" : ""}
				{m.delta}
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-foreground">
					{m.reason
						? (STOCK_MOVEMENT_REASON_LABELS[
								m.reason as keyof typeof STOCK_MOVEMENT_REASON_LABELS
							] ?? m.reason)
						: "Sem motivo"}
					{m.supplierName ? (
						<span className="ml-1 text-muted-foreground">
							· {m.supplierName}
						</span>
					) : null}
					{m.reasonNote ? (
						<span className="ml-1 text-muted-foreground">— {m.reasonNote}</span>
					) : null}
				</p>
				<p className="text-muted-foreground">
					{m.actorName ?? "Sistema"}
					{" · "}
					{formatRelative(m.createdAt)}
				</p>
			</div>
		</li>
	);
}

// ─── Card de movimentos (scroll interno + lazy load) ─────────────────────────

interface MovementsCardProps {
	branchId: string;
	toolId: string;
	variantId: string;
}

export function MovementsCard({
	branchId,
	toolId,
	variantId,
}: MovementsCardProps) {
	const [items, setItems] = useState<StockMovementRow[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [pending, startTransition] = useTransition();
	const scrollRef = useRef<HTMLDivElement>(null);

	// key={variantId} no caller remonta este card por variante → carrega a 1ª página.
	useEffect(() => {
		startTransition(async () => {
			const r = await fetchVariantBranchMovementsPageAction(
				variantId,
				branchId,
				null
			);
			setItems(r.items);
			setCursor(r.nextCursor);
			setLoaded(true);
		});
	}, [variantId, branchId]);

	const loadMore = useCallback(() => {
		if (!cursor) {
			return;
		}
		const current = cursor;
		startTransition(async () => {
			const r = await fetchVariantBranchMovementsPageAction(
				variantId,
				branchId,
				current
			);
			setItems((prev) => [...prev, ...r.items]);
			setCursor(r.nextCursor);
		});
	}, [cursor, variantId, branchId]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
			<div className="border-border border-b px-4 py-3">
				<p className="font-medium text-sm">Movimentos recentes</p>
				<p className="text-muted-foreground text-xs">
					desta ferramenta nesta filial
				</p>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
				{loaded && items.length === 0 ? (
					<p className="px-4 py-6 text-center text-muted-foreground text-xs italic">
						Nenhum movimento registrado.
					</p>
				) : (
					<ul className="divide-y divide-border">
						{items.map((m) => (
							<MovementRow key={m.id} m={m} />
						))}
					</ul>
				)}
				<InfiniteSentinel
					error={null}
					hasMore={cursor !== null}
					onLoadMore={loadMore}
					pending={pending}
					root={scrollRef}
				/>
			</div>
			<Link
				className="flex items-center gap-1 border-border border-t px-4 py-3 font-medium text-primary text-xs transition-colors hover:bg-muted"
				href={`/dashboard/branches/${branchId}?tab=activity&type=stock&toolId=${toolId}`}
			>
				Ver atividade completa da filial
				<ArrowRight className="size-3" />
			</Link>
		</div>
	);
}
