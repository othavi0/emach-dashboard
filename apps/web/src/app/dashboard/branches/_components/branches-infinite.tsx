"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	type BranchesFiltersInput,
	type BranchListItem,
	fetchBranchesPage,
} from "../actions";
import { BranchesTable, type BranchRow } from "./branches-table";

interface BranchesInfiniteProps {
	canMutate: boolean;
	filters: BranchesFiltersInput;
	initial: BranchListItem[];
	initialCursor: string | null;
}

function toRow(b: BranchListItem): BranchRow {
	return {
		id: b.id,
		name: b.name,
		address: b.address,
		createdAt: b.createdAt,
	};
}

export function BranchesInfinite({
	initial,
	initialCursor,
	filters,
	canMutate,
}: BranchesInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchesPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<BranchesTable branches={items.map(toRow)} canMutate={canMutate} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
