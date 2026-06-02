"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
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
	const sel = useBulkSelection({
		items,
		getId: (c) => c.id,
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
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((item) => (
					<SelectableItem
						active={sel.active}
						key={item.id}
						onToggle={() => sel.toggle(item.id)}
						selected={sel.isSelected(item.id)}
					>
						<CustomerCard customer={item} />
					</SelectableItem>
				))}
			</div>
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
								window.location.href = `/dashboard/customers/export?ids=${ids.join(",")}`;
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
