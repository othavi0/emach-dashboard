"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchReviewsPage } from "../actions";
import type { ReviewListItem } from "../data";
import type { BulkModerateStatus, ReviewsListFiltersParsed } from "../schema";
import { BulkModerateDialog } from "./bulk-moderate-dialog";
import { ReviewCard } from "./review-card";

interface ReviewsInfiniteProps {
	filters: ReviewsListFiltersParsed;
	initial: ReviewListItem[];
	initialCursor: string | null;
}

const BULK_ACTIONS: {
	label: string;
	status: BulkModerateStatus;
	variant: "default" | "destructive" | "secondary";
}[] = [
	{ label: "Aprovar", status: "approved", variant: "default" },
	{ label: "Rejeitar", status: "rejected", variant: "secondary" },
	{ label: "Spam", status: "spam", variant: "destructive" },
];

export function ReviewsInfinite({
	initial,
	initialCursor,
	filters,
}: ReviewsInfiniteProps) {
	const router = useRouter();
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error, removeItem } =
		useInfiniteList({
			initialItems: initial,
			initialCursor,
			fetchPage: (cursor) => fetchReviewsPage({ filters, cursor }),
			resetKey,
		});
	const sel = useBulkSelection({ items, getId: (item) => item.id, resetKey });
	const [bulkStatus, setBulkStatus] = useState<BulkModerateStatus | null>(null);

	// A ação cujo status é o da aba atual não faz nada (todo card visível já tem
	// esse status) — não mostrar o botão.
	const actions = BULK_ACTIONS.filter(
		(action) => action.status !== filters.tab
	);

	function handleBulkSuccess(moderatedIds: string[]) {
		// useInfiniteList não ressincroniza com initialItems: os cards moderados
		// saem da lista aqui, não pelo revalidatePath do servidor.
		if (bulkStatus !== filters.tab) {
			removeItem((item) => moderatedIds.includes(item.id));
		}
		setBulkStatus(null);
		sel.exit();
		// Atualiza as contagens das abas e o <Empty> quando a aba esvazia.
		router.refresh();
	}

	return (
		<div aria-live="polite">
			<div className="mb-3 flex justify-end">
				<SelectionToolbar
					active={sel.active}
					allLoadedSelected={sel.allLoadedSelected}
					loadedCount={items.length}
					onCancel={sel.exit}
					onEnter={sel.enter}
					onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((review) => (
					<SelectableItem
						active={sel.active}
						key={review.id}
						onToggle={() => sel.toggle(review.id)}
						selected={sel.isSelected(review.id)}
					>
						<ReviewCard review={review} />
					</SelectableItem>
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			{sel.count > 0 ? (
				<BulkActionBar
					actions={actions.map((action) => ({
						label: action.label,
						run: () => setBulkStatus(action.status),
						variant: action.variant,
					}))}
					onClear={sel.clear}
					selectedIds={sel.selectedIds}
				/>
			) : null}
			{bulkStatus ? (
				<BulkModerateDialog
					count={sel.count}
					onClose={() => setBulkStatus(null)}
					onSuccess={handleBulkSuccess}
					reviewIds={sel.selectedIds}
					status={bulkStatus}
				/>
			) : null}
		</div>
	);
}
