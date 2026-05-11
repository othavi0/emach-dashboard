"use client";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchStockPage, type StockFiltersInput } from "../actions";
import { StockCardActions } from "./stock-card-actions";

interface StockInfiniteProps {
	canMutate: boolean;
	filters: StockFiltersInput;
	initial: ToolCardData[];
	initialCursor: string | null;
}

export function StockInfinite({
	initial,
	initialCursor,
	filters,
	canMutate,
}: StockInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchStockPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<ToolCardGrid
				canMutate={canMutate}
				renderActions={(tool) => (
					<StockCardActions toolId={tool.id} toolName={tool.name} />
				)}
				tools={items}
				variant="stock-overview"
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
