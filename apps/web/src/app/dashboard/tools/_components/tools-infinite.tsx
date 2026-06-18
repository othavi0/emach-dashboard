"use client";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchToolsPageAction } from "../actions";
import type { ToolsFiltersInput } from "../data";

interface ToolsInfiniteProps {
	filters: ToolsFiltersInput;
	initial: ToolCardData[];
	initialCursor: string | null;
}

export function ToolsInfinite({
	initial,
	initialCursor,
	filters,
}: ToolsInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchToolsPageAction({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<ToolCardGrid tools={items} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
