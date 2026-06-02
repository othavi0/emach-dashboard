"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchReviewsPage } from "../actions";
import type { ReviewListItem } from "../data";
import type { ReviewsListFiltersParsed } from "../schema";
import { ReviewCard } from "./review-card";

interface ReviewsInfiniteProps {
	filters: ReviewsListFiltersParsed;
	initial: ReviewListItem[];
	initialCursor: string | null;
}

export function ReviewsInfinite({
	initial,
	initialCursor,
	filters,
}: ReviewsInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchReviewsPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((review) => (
					<ReviewCard key={review.id} review={review} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
