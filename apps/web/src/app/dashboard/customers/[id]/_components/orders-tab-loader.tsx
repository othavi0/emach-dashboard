"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { InfiniteResult } from "@/lib/infinite";
import { fetchCustomerOrdersPage } from "../../actions";
import type { CustomerOrderRow } from "../../data";
import { OrdersTab } from "./orders-tab";

export function OrdersTabLoader({ clientId }: { clientId: string }) {
	return (
		<LazyTab load={() => fetchCustomerOrdersPage({ clientId, cursor: null })}>
			{(first: InfiniteResult<CustomerOrderRow>) => (
				<OrdersTab clientId={clientId} first={first} />
			)}
		</LazyTab>
	);
}
