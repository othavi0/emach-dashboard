"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	type BranchStockFiltersInput,
	type BranchStockRow,
	fetchBranchStockPage,
} from "../branch-stock-data";
import { BranchStockCardGrid } from "./branch-stock-card-grid";

interface BranchStockInfiniteProps {
	branchName: string;
	canMutate: boolean;
	filters: BranchStockFiltersInput;
	initial: BranchStockRow[];
	initialCursor: string | null;
}

export function BranchStockInfinite({
	initial,
	initialCursor,
	filters,
	branchName,
	canMutate,
}: BranchStockInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchStockPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<BranchStockCardGrid
				branchId={filters.branchId}
				branchName={branchName}
				canMutate={canMutate}
				rows={items}
			/>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
