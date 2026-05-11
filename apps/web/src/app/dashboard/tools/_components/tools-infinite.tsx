"use client";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchToolsPage, type ToolsFiltersInput } from "../actions";
import { ToolCardActions } from "./tool-card-actions";

interface ToolsInfiniteProps {
	canMutate: boolean;
	filters: ToolsFiltersInput;
	initial: ToolCardData[];
	initialCursor: string | null;
}

export function ToolsInfinite({
	initial,
	initialCursor,
	filters,
	canMutate,
}: ToolsInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchToolsPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<ToolCardGrid
				canMutate={canMutate}
				renderActions={(tool) => (
					<ToolCardActions toolId={tool.id} toolName={tool.name} />
				)}
				tools={items}
				variant="catalog"
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
