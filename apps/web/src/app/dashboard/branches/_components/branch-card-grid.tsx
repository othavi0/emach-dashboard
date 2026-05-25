"use client";

import { Building2 } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { type BranchesFiltersInput, fetchBranchesTablePage } from "../actions";
import type { BranchTableRow } from "../data";
import { BranchCard } from "./branch-card";

interface BranchCardGridProps {
	canMutate: boolean;
	filters: BranchesFiltersInput;
	initial: BranchTableRow[];
	initialCursor: string | null;
}

export function BranchCardGrid({
	canMutate,
	filters,
	initial,
	initialCursor,
}: BranchCardGridProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchesTablePage({ filters, cursor }),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Building2 aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhuma filial encontrada</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre a primeira filial.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((b) => (
					<BranchCard branch={b} canMutate={canMutate} key={b.id} />
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
