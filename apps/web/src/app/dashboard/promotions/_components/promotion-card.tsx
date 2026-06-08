import { Star, Tag, Ticket } from "lucide-react";
import Link from "next/link";

import type { PromotionListItem } from "../actions";
import {
	daysRemainingDisplay,
	formatDiscount,
	formatJanela,
} from "./_lib/format";
import { PromotionStatusBadge } from "./promotion-status-badge";

const METRIC_LABEL =
	"text-[9px] text-muted-foreground uppercase tracking-wider";

export function PromotionCard({ promotion }: { promotion: PromotionListItem }) {
	const isCoupon = promotion.type === "promocode";
	const dimmed =
		promotion.status === "inactive" || promotion.status === "expired";
	const remaining = daysRemainingDisplay(promotion.status, promotion.endsAt);
	let remainingTone = "text-foreground";
	if (remaining.tone === "danger") {
		remainingTone = "text-destructive";
	} else if (remaining.tone === "warning") {
		remainingTone = "text-amber-500";
	}

	return (
		<Link
			className={`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dimmed ? "opacity-70" : ""}`}
			href={`/dashboard/promotions/${promotion.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-foreground">
					{isCoupon ? (
						<Ticket aria-hidden className="size-5" />
					) : (
						<Tag aria-hidden className="size-5" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-1 font-semibold text-[15px] text-foreground leading-tight">
						{promotion.title}
					</p>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{isCoupon ? "Cupom" : "Automática"}
						{isCoupon && promotion.code ? ` · ${promotion.code}` : ""}
					</p>
					{promotion.featured && (
						<span className="mt-1 inline-flex items-center gap-1 font-medium text-[10px] text-primary uppercase tracking-wide">
							<Star aria-hidden className="size-3 fill-current" />
							Destaque no home
						</span>
					)}
				</div>
				<PromotionStatusBadge status={promotion.status} />
			</div>

			<div className="px-4 pb-3">
				<span className="font-medium text-[32px] text-primary tabular-nums leading-none">
					{formatDiscount(promotion.discountType, promotion.discountValue)}
				</span>
				<p className="mt-1 text-[11px] text-muted-foreground">
					{formatJanela(promotion.startsAt, promotion.endsAt)}
				</p>
			</div>

			<div className="mt-auto grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${!promotion.appliesToAll && promotion.tools.length === 0 ? "text-warning" : "text-foreground"}`}
					>
						{promotion.appliesToAll ? "Todas" : promotion.tools.length}
					</span>
					<span className={METRIC_LABEL}>Alcance</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${remainingTone}`}
					>
						{remaining.value}
					</span>
					<span className={METRIC_LABEL}>Dias restantes</span>
				</div>
			</div>
		</Link>
	);
}
