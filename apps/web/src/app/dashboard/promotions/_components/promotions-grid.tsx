"use client";

import type { PromotionDetail, PromotionListItem } from "../actions";
import { PromotionCard } from "./promotion-card";
import { PromotionSheet } from "./promotion-sheet";

interface PromotionsGridProps {
	canMutate: boolean;
	promotions: PromotionListItem[];
	selectedPromotion: PromotionDetail | null;
}

export function PromotionsGrid({
	canMutate,
	promotions,
	selectedPromotion,
}: PromotionsGridProps) {
	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{promotions.map((p) => (
					<PromotionCard canMutate={canMutate} key={p.id} promotion={p} />
				))}
			</div>
			<PromotionSheet canMutate={canMutate} promotion={selectedPromotion} />
		</>
	);
}
