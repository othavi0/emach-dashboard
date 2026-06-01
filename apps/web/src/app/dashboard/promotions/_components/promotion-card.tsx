"use client";

import { Badge } from "@emach/ui/components/badge";
import { useRouter, useSearchParams } from "next/navigation";

import type { PromotionListItem } from "../actions";
import { formatDesconto, formatJanela } from "./_lib/format";
import { CopyCodeButton } from "./copy-code-button";
import { PromotionQuickActions } from "./promotion-quick-actions";
import { PromotionStatusBadge } from "./promotion-status-badge";

interface PromotionCardProps {
	canMutate: boolean;
	promotion: PromotionListItem;
}

const MAX_TOOL_CHIPS = 3;

export function PromotionCard({ canMutate, promotion }: PromotionCardProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	function openSheet() {
		const params = new URLSearchParams(searchParams);
		params.set("view", promotion.id);
		router.push(`/dashboard/promotions?${params.toString()}`, {
			scroll: false,
		});
	}

	const visibleTools = promotion.tools.slice(0, MAX_TOOL_CHIPS);
	const overflow = promotion.tools.length - visibleTools.length;
	const hasNoTools = promotion.tools.length === 0;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card interativo com conteúdo não-interativo interno (h3, badges, chips)
		<div
			className={`group flex cursor-pointer flex-col rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${promotion.status === "inactive" || promotion.status === "expired" ? "opacity-70" : ""}`}
			onClick={openSheet}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					openSheet();
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Header: tipo + status */}
			<div className="flex items-start justify-between gap-2">
				{promotion.type === "promocode" ? (
					<Badge variant="info">Cupom</Badge>
				) : (
					<Badge variant="outline">Automática</Badge>
				)}
				<PromotionStatusBadge status={promotion.status} />
			</div>

			{/* Identidade + valor */}
			<div className="mt-3 flex flex-col gap-2">
				<h3 className="line-clamp-2 font-semibold text-[15px] text-foreground leading-snug">
					{promotion.title}
				</h3>
				<div className="flex items-end justify-between gap-2">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-[32px] text-primary tabular-nums leading-none">
							{formatDesconto(promotion.discountPct)}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{formatJanela(promotion.startsAt, promotion.endsAt)}
						</span>
					</div>
					{promotion.type === "promocode" && promotion.code && (
						<span className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-foreground text-xs">
							{promotion.code}
							<CopyCodeButton code={promotion.code} />
						</span>
					)}
				</div>
			</div>

			{/* Ferramentas */}
			<div className="mt-3 flex flex-col gap-1.5">
				{hasNoTools ? (
					<Badge className="w-fit" variant="warning">
						Sem ferramentas
					</Badge>
				) : (
					<>
						<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
							{promotion.tools.length} ferramenta
							{promotion.tools.length === 1 ? "" : "s"}
						</span>
						<div className="flex flex-wrap gap-1">
							{visibleTools.map((t) => (
								<span
									className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs"
									key={t.id}
									title={t.name}
								>
									{t.name}
								</span>
							))}
							{overflow > 0 && (
								<span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
									+{overflow}
								</span>
							)}
						</div>
					</>
				)}
			</div>

			{canMutate && (
				<div className="mt-auto border-border border-t pt-4">
					<PromotionQuickActions canMutate={canMutate} promotion={promotion} />
				</div>
			)}
		</div>
	);
}
