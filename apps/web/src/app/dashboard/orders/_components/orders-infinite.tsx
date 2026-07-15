"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { bulkStartSeparation, fetchOrdersPage } from "../actions";
import type { OrderListItem, OrdersPageFiltersInput } from "../data";
import { OrderCardGrid } from "./order-card-grid";

interface OrdersInfiniteProps {
	filters: OrdersPageFiltersInput;
	highlightToolId?: string | null;
	initial: OrderListItem[];
	initialCursor: string | null;
	tabKey: string;
}

function pluralSuffix(count: number): string {
	return count === 1 ? "" : "s";
}

/**
 * Extraído do callback de `runBulkSeparation` para ficar sob o teto de
 * complexidade cognitiva do ultracite (o inline original somava 23 > 20
 * pelas ramificações + ternários no template).
 */
function buildBulkSeparationToast(
	moved: number,
	skipped: { number: string; reason: string }[]
): { kind: "success" | "warning"; message: string } {
	if (skipped.length === 0) {
		return {
			kind: "success",
			message: `${moved} pedido${pluralSuffix(moved)} enviado${pluralSuffix(moved)} para separação`,
		};
	}
	const detail = skipped.map((s) => `${s.number} (${s.reason})`).join(", ");
	return {
		kind: "warning",
		message: `${moved} enviado${pluralSuffix(moved)} para separação · ${skipped.length} pulado${pluralSuffix(skipped.length)}: ${detail}`,
	};
}

export function OrdersInfinite({
	initial,
	initialCursor,
	filters,
	highlightToolId,
	tabKey,
}: OrdersInfiniteProps) {
	const router = useRouter();
	// Bump força o useInfiniteList a re-sincronizar com o initial revalidado
	// após uma mutação em massa (router.refresh não reseta client state).
	const [refreshTick, setRefreshTick] = useState(0);
	const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;
	const [bulkPending, startBulk] = useTransition();
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

	const paidById = new Map(items.map((o) => [o.id, o.status === "paid"]));
	const selectedPaidIds = sel.selectedIds.filter((id) => paidById.get(id));

	const runBulkSeparation = () => {
		startBulk(async () => {
			const result = await bulkStartSeparation({ orderIds: selectedPaidIds });
			// Refresh SEMPRE: cada pedido é uma transação própria, então um lote que
			// retorna {ok:false} pode ter movido parte deles antes de abortar — sem
			// isso, a lista seguiria mostrando "Pago" para pedido já em separação.
			setRefreshTick((t) => t + 1);
			router.refresh();
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			const { kind, message } = buildBulkSeparationToast(
				result.data.moved,
				result.data.skipped
			);
			notify[kind](message);
			sel.exit();
		});
	};

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
				highlightToolId={highlightToolId}
				items={items}
				selection={{
					active: sel.active,
					isSelected: sel.isSelected,
					onToggle: sel.toggle,
				}}
				tabKey={tabKey}
			/>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			{sel.count > 0 && (
				<BulkActionBar
					actions={
						selectedPaidIds.length > 0
							? [
									{
										label: bulkPending
											? "Enviando…"
											: `Enviar para separação (${selectedPaidIds.length})`,
										run: runBulkSeparation,
									},
								]
							: []
					}
					onClear={sel.clear}
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
