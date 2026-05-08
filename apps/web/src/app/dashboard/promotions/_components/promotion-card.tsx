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
		<div
			className="flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors focus-within:ring-2 focus-within:ring-primary/30 hover:border-border/80"
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
			<div className="flex items-start justify-between gap-2">
				{promotion.type === "promocode" ? (
					<Badge variant="info">Cupom</Badge>
				) : (
					<Badge variant="outline">Automática</Badge>
				)}
				<PromotionStatusBadge status={promotion.status} />
			</div>

			<h3 className="line-clamp-2 font-medium font-serif text-[17px] text-foreground leading-[1.3]">
				{promotion.title}
			</h3>

			<div className="flex items-baseline justify-between gap-2">
				<span className="font-medium text-[32px] text-primary tabular-nums leading-none">
					{formatDesconto(promotion.discountPct)}
				</span>
				{promotion.type === "promocode" && promotion.code && (
					<span className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
						{promotion.code}
						<CopyCodeButton code={promotion.code} />
					</span>
				)}
			</div>

			<p className="text-muted-foreground text-xs">
				{formatJanela(promotion.startsAt, promotion.endsAt)}
			</p>

			<hr className="border-border" />

			<div className="flex flex-col gap-1">
				{hasNoTools ? (
					<Badge className="w-fit" variant="warning">
						Sem ferramentas
					</Badge>
				) : (
					<>
						<span className="text-muted-foreground text-xs">
							{promotion.tools.length} ferramenta
							{promotion.tools.length === 1 ? "" : "s"}:
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
				<div className="flex items-center justify-end border-border border-t pt-2">
					<PromotionQuickActions
						canMutate={canMutate}
						promotion={promotion}
						variant="card"
					/>
				</div>
			)}
		</div>
	);
}
