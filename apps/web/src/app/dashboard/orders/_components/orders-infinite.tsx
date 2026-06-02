"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
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
	const sel = useBulkSelection({
		items,
		getId: (o) => o.id,
		resetKey,
	});

	return (
		<div aria-live="polite">
			<div className="mb-3 flex justify-end">
				<SelectionToolbar
					active={sel.active}
					allLoadedSelected={sel.allLoadedSelected}
					loadedCount={items.length}
					onCancel={sel.exit}
					onEnter={sel.enter}
					onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
				/>
			</div>
			<OrderCardGrid
				items={items}
				selection={{
					active: sel.active,
					isSelected: sel.isSelected,
					onToggle: sel.toggle,
				}}
			/>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			{sel.count > 0 && (
				<BulkActionBar
					actions={[
						{
							label: "Exportar CSV",
							run: (ids) => {
								window.location.href = `/dashboard/orders/export?ids=${ids.join(",")}`;
							},
						},
					]}
					onClear={sel.clear}
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
