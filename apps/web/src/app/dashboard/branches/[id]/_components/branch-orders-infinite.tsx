"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchBranchOrdersPage } from "../../actions";
import type { BranchOrderRow } from "../../data";
import { OrderCard } from "./orders-tab";

interface Props {
	branchId: string;
	initial: BranchOrderRow[];
	initialCursor: string | null;
}

export function BranchOrdersInfinite({
	branchId,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchOrdersPage({ branchId, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((o) => (
					<OrderCard key={o.id} order={o} />
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
