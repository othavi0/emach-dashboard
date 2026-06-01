"use client";

import { Factory } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	fetchSuppliersTablePage,
	type SuppliersFiltersInput,
} from "../actions";
import type { SupplierTableRow } from "../data";
import { SupplierCard } from "./supplier-card";

interface SupplierCardGridProps {
	filters: SuppliersFiltersInput;
	initial: SupplierTableRow[];
	initialCursor: string | null;
}

export function SupplierCardGrid({
	filters,
	initial,
	initialCursor,
}: SupplierCardGridProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchSuppliersTablePage({ filters, cursor }),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Factory aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhum fornecedor encontrado</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre o primeiro fornecedor.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((s) => (
					<SupplierCard key={s.id} supplier={s} />
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
