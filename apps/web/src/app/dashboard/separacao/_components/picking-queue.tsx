"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";

type Tab = "a_separar" | "em_separacao" | "excecoes";

const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido sendo separado no momento.",
	excecoes: "Sem exceções no momento.",
};

interface PickingQueueProps {
	activeTab: Tab;
	counts: { a_separar: number; em_separacao: number; excecoes: number };
	initial: PickingQueueRow[];
	initialCursor: string | null;
}

export function PickingQueue({
	activeTab,
	counts,
	initial,
	initialCursor,
}: PickingQueueProps) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchPickingQueuePageAction({ cursor, tab: activeTab }),
		resetKey: activeTab,
	});
	const sel = useBulkSelection({
		items,
		getId: (row) => row.orderId,
		resetKey: activeTab,
	});
	// Exceções não imprimem (spec): sem modo seleção nessa tab.
	const selectable = activeTab !== "excecoes";

	const printSelected = (ids: string[]) => {
		window.open(
			`/dashboard/orders/picking-list?ids=${ids.join(",")}`,
			"_blank",
			"noopener"
		);
	};

	return (
		<div>
			<SeparacaoTabs
				activeTab={activeTab}
				counts={counts}
				toolbar={
					selectable ? (
						<SelectionToolbar
							active={sel.active}
							allLoadedSelected={sel.allLoadedSelected}
							loadedCount={items.length}
							onCancel={sel.exit}
							onEnter={sel.enter}
							onToggleAll={
								sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded
							}
						/>
					) : undefined
				}
			/>

			{/* Grid de cards */}
			{items.length === 0 && !pending && !error ? (
				<p className="py-10 text-center text-muted-foreground text-sm">
					{TAB_EMPTY[activeTab]}
				</p>
			) : (
				<div
					aria-live="polite"
					className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
				>
					{items.map((row) => (
						<SelectableItem
							active={selectable && sel.active}
							key={row.orderId}
							onToggle={() => sel.toggle(row.orderId)}
							selected={sel.isSelected(row.orderId)}
						>
							<PickingOrderCard row={row} tab={activeTab} />
						</SelectableItem>
					))}
				</div>
			)}

			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>

			{selectable && sel.count > 0 && (
				<BulkActionBar
					actions={[
						{
							label: `Imprimir lista (${sel.count})`,
							run: printSelected,
						},
					]}
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
