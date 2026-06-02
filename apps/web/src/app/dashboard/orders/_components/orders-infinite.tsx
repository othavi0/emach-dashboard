"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchOrdersPage } from "../actions";
import type { OrderListItem, OrdersPageFiltersInput } from "../data";
import { OrderCardGrid } from "./order-card-grid";

interface OrdersInfiniteProps {
	filters: OrdersPageFiltersInput;
	initial: OrderListItem[];
	initialCursor: string | null;
}

export function OrdersInfinite({
	initial,
	initialCursor,
	filters,
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
			<OrderCardGrid items={items} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
