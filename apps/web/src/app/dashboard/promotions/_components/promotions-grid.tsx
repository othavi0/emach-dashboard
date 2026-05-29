"use client";

import { Tag } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	fetchPromotionsPage,
	type ListPromotionsOptions,
	type PromotionDetail,
	type PromotionListItem,
} from "../actions";
import { PromotionCard } from "./promotion-card";
import { PromotionEditSheet } from "./promotion-edit-sheet";
import { PromotionSheet } from "./promotion-sheet";

interface PromotionsGridProps {
	availableTools: { id: string; name: string }[];
	canMutate: boolean;
	editPromotion: PromotionDetail | null;
	filters: ListPromotionsOptions;
	initial: PromotionListItem[];
	initialCursor: string | null;
	selectedPromotion: PromotionDetail | null;
}

export function PromotionsGrid({
	availableTools,
	canMutate,
	editPromotion,
	filters,
	initial,
	initialCursor,
	selectedPromotion,
}: PromotionsGridProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchPromotionsPage({ filters, cursor }),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<>
				<div className="flex flex-col items-center gap-2 py-16 text-center">
					<Tag aria-hidden className="size-12 opacity-40" />
					<p className="font-medium text-sm">Nenhuma promoção encontrada</p>
					<p className="text-muted-foreground text-xs">
						Ajuste os filtros ou cadastre a primeira promoção.
					</p>
				</div>
				<PromotionSheet canMutate={canMutate} promotion={selectedPromotion} />
				<PromotionEditSheet
					availableTools={availableTools}
					promotion={editPromotion}
				/>
			</>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{items.map((p) => (
					<PromotionCard canMutate={canMutate} key={p.id} promotion={p} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			<PromotionSheet canMutate={canMutate} promotion={selectedPromotion} />
			<PromotionEditSheet
				availableTools={availableTools}
				promotion={editPromotion}
			/>
		</div>
	);
}
