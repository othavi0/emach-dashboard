"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { InfiniteResult } from "@/lib/infinite";
import { fetchBranchOrdersPage } from "../../actions";
import type { BranchOrderRow } from "../../data";
import { OrdersTab } from "./orders-tab";

export function OrdersTabLoader({ branchId }: { branchId: string }) {
	return (
		<LazyTab load={() => fetchBranchOrdersPage({ branchId, cursor: null })}>
			{(first: InfiniteResult<BranchOrderRow>) => (
				<OrdersTab branchId={branchId} first={first} />
			)}
		</LazyTab>
	);
}
