"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchSupplierToolsPage } from "../../actions";
import type { SupplierToolRow } from "../../data";
import { SupplierToolCard } from "./supplier-tool-card";

interface Props {
	initial: SupplierToolRow[];
	initialCursor: string | null;
	search?: string;
	supplierId: string;
}

export function SupplierToolsInfinite({
	supplierId,
	search,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchSupplierToolsPage({ supplierId, search, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((t) => (
					<SupplierToolCard key={t.id} tool={t} />
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
