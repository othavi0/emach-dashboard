"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCustomersPage } from "../actions";
import type { CustomerListItem, CustomersListFilters } from "../data";
import { CustomerCard } from "./customer-card";

interface CustomersInfiniteProps {
	filters: CustomersListFilters;
	initial: CustomerListItem[];
	initialCursor: string | null;
}

export function CustomersInfinite({
	initial,
	initialCursor,
	filters,
}: CustomersInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchCustomersPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((item) => (
					<CustomerCard customer={item} key={item.id} />
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
