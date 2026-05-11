"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchOrdersPage } from "../actions";
import type {
	OrderListFilters,
	OrderListItem,
	OrdersPageFiltersInput,
} from "../data";
import { OrderTable } from "./order-table";

interface OrdersInfiniteProps {
	filters: OrdersPageFiltersInput;
	initial: OrderListItem[];
	initialCursor: string | null;
	tableFilters: OrderListFilters;
}

export function OrdersInfinite({
	initial,
	initialCursor,
	filters,
	tableFilters,
}: OrdersInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchOrdersPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<OrderTable
				filters={tableFilters}
				items={items}
				page={1}
				totalPages={1}
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
