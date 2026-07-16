"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { bulkStartSeparation, fetchOrdersPage } from "../actions";
import type { OrderListItem, OrdersPageFiltersInput } from "../data";
import { OrderCardGrid } from "./order-card-grid";

interface OrdersViewProps {
	filters: OrdersPageFiltersInput;
	/** Painel de filtros (Server Component), renderizado entre o header e o grid. */
	filtersSlot: ReactNode;
	hasFilters: boolean;
	highlightToolId?: string | null;
	initial: OrderListItem[];
	initialCursor: string | null;
	/** Resumo do filtro de produto (Server Component), quando ativo. */
	summarySlot: ReactNode;
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

/**
 * Casca client da página de Pedidos: possui o estado de lista+seleção e por
 * isso renderiza o PageHeader ele mesmo — o SelectionToolbar vive no slot de
 * ação do header. Os pedaços server (filtros, resumo) entram via slots.
 */
export function OrdersView({
	filters,
	filtersSlot,
	hasFilters,
	highlightToolId,
	initial,
	initialCursor,
	summarySlot,
	tabKey,
}: OrdersViewProps) {
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
			if (result.data.movedIds.length > 0) {
				const pdfUrl = `/dashboard/orders/picking-list?ids=${result.data.movedIds.join(",")}`;
				// Abre o PDF do lote; se o popup blocker engolir, o botão do toast cobre.
				window.open(pdfUrl, "_blank", "noopener");
				notify[kind](message, {
					action: {
						label: "Imprimir lista",
						onClick: () => window.open(pdfUrl, "_blank", "noopener"),
					},
				});
			} else {
				notify[kind](message);
			}
			sel.exit();
		});
	};

	// Tab "Pronto para enviar" (picked): abre o documento de dados de envio do
	// lote selecionado. A rota re-valida o escopo/etapa server-side (ids fora de
	// preparing+completed são descartados em silêncio), então basta os ids.
	const openShippingDoc = () => {
		const url = `/dashboard/orders/shipping-doc?ids=${sel.selectedIds.join(",")}`;
		window.open(url, "_blank", "noopener");
		sel.exit();
	};

	const bulkActions: { label: string; run: () => void }[] = [];
	if (selectedPaidIds.length > 0) {
		bulkActions.push({
			label: bulkPending
				? "Enviando…"
				: `Enviar para separação (${selectedPaidIds.length})`,
			run: runBulkSeparation,
		});
	}
	if (tabKey === "picked" && sel.selectedIds.length > 0) {
		bulkActions.push({
			label: `Dados de envio (${sel.selectedIds.length})`,
			run: openShippingDoc,
		});
	}

	return (
		<>
			<PageHeader
				action={
					items.length > 0 ? (
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
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

			{filtersSlot}
			{summarySlot}

			{items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
								: "Nenhum pedido nesta etapa. Use a aba “Todos” para ver o histórico completo."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters && (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/orders"
							>
								Limpar filtros
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<div aria-live="polite">
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
							actions={bulkActions}
							selectedIds={sel.selectedIds}
						/>
					)}
				</div>
			)}
		</>
	);
}
