"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCustomersPage } from "../actions";
import type { CustomerListItem, CustomersListFilters } from "../data";
import { CustomerTable } from "./customer-table";

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
			<CustomerTable items={items} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
