"use client";

import { useState } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchBranchStockPageAction } from "../actions";
import type {
	BranchStockFiltersInput,
	BranchStockRow,
} from "../branch-stock-data";
import { BranchStockCardGrid } from "./branch-stock-card-grid";
import { BranchStockEditSheet } from "./branch-stock-edit-sheet";

interface BranchStockInfiniteProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	filters: BranchStockFiltersInput;
	initial: BranchStockRow[];
	initialCursor: string | null;
	suppliers: ActiveSupplierOption[];
}

export function BranchStockInfinite({
	initial,
	initialCursor,
	filters,
	branchId,
	branchName,
	canMutate,
	suppliers,
}: BranchStockInfiniteProps) {
	const [selectedRow, setSelectedRow] = useState<BranchStockRow | null>(null);

	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchStockPageAction({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<BranchStockCardGrid onSelect={setSelectedRow} rows={items} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			<BranchStockEditSheet
				branchId={branchId}
				branchName={branchName}
				canMutate={canMutate}
				onClose={() => setSelectedRow(null)}
				row={selectedRow}
				suppliers={suppliers}
			/>
		</div>
	);
}
