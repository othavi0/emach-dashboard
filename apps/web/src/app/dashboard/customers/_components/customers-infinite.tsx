"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCustomersPage } from "../actions";
import type {
	CustomerListItem,
	CustomerStatusCounts,
	CustomersListFilters,
} from "../data";
import { CustomerRow } from "./customer-row";
import { CustomerStatusTabs } from "./customer-status-tabs";

interface CustomersInfiniteProps {
	counts: CustomerStatusCounts;
	filters: CustomersListFilters;
	initial: CustomerListItem[];
	initialCursor: string | null;
}

export function CustomersInfinite({
	counts,
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
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<CustomerStatusTabs counts={counts} />
				<SelectionToolbar
					active={sel.active}
					allLoadedSelected={sel.allLoadedSelected}
					loadedCount={items.length}
					onCancel={sel.exit}
					onEnter={sel.enter}
					onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
				/>
			</div>
			<div className="flex flex-col gap-2">
				{items.map((item) => (
					<SelectableItem
						active={sel.active}
						key={item.id}
						onToggle={() => sel.toggle(item.id)}
						selected={sel.isSelected(item.id)}
					>
						<CustomerRow customer={item} />
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
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
