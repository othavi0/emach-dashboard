"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
	type BulkAction,
	BulkActionBar,
} from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { splitQueueByOwnership } from "../_lib/picking-logic";
import { bulkStartPicking, fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";

type Tab = "a_separar" | "em_separacao" | "excecoes";

const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido sendo separado no momento.",
	excecoes: "Sem exceções no momento.",
};

function pluralSuffix(count: number): string {
	return count === 1 ? "" : "s";
}

/** Labels das seções por tab com dono (mockup A, spec 2026-07-17). */
const SECTION_LABELS: Record<
	"em_separacao" | "excecoes",
	{ mine: string; others: string }
> = {
	em_separacao: { mine: "Minhas separações", others: "Outros operadores" },
	excecoes: { mine: "Minhas exceções", others: "De outros operadores" },
};

function QueueSectionHeader({
	count,
	label,
}: {
	count: number;
	label: string;
}) {
	return (
		<div className="mt-5 mb-2.5 flex items-center gap-2 first:mt-1">
			<span className="font-bold text-[11px] text-muted-foreground uppercase tracking-[0.09em]">
				{label}
			</span>
			<span className="rounded-md bg-secondary px-1.5 font-semibold text-[10px] text-secondary-foreground leading-[17px]">
				{count}
			</span>
			<span aria-hidden className="h-px flex-1 bg-border" />
		</div>
	);
}

/**
 * Extraído do callback de `runBulkPick` para ficar sob o teto de complexidade
 * cognitiva do ultracite — espelha `buildBulkSeparationToast` (orders-view.tsx).
 */
function buildBulkPickToast(
	moved: number,
	skipped: { number: string; reason: string }[]
): { kind: "success" | "warning"; message: string } {
	if (skipped.length === 0) {
		return {
			kind: "success",
			message: `${moved} pedido${pluralSuffix(moved)} em separação`,
		};
	}
	const detail = skipped.map((s) => `${s.number} (${s.reason})`).join(", ");
	return {
		kind: "warning",
		message: `${moved} em separação · ${skipped.length} pulado${pluralSuffix(skipped.length)}: ${detail}`,
	};
}

interface PickingQueueProps {
	activeTab: Tab;
	canManageOthers: boolean;
	counts: { a_separar: number; em_separacao: number; excecoes: number };
	initial: PickingQueueRow[];
	initialCursor: string | null;
	sessionUserId: string;
}

export function PickingQueue({
	activeTab,
	canManageOthers,
	counts,
	initial,
	initialCursor,
	sessionUserId,
}: PickingQueueProps) {
	const router = useRouter();
	// Bump força o useInfiniteList/useBulkSelection a re-sincronizar com o
	// initial revalidado após uma mutação em massa (router.refresh não reseta
	// client state) — mesmo padrão do refreshTick em orders-view.tsx.
	const [refreshTick, setRefreshTick] = useState(0);
	const resetKey = `${activeTab}:${refreshTick}`;
	const [pickPending, startPick] = useTransition();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchPickingQueuePageAction({ cursor, tab: activeTab }),
		resetKey,
	});
	const sel = useBulkSelection({
		items,
		getId: (row) => row.orderId,
		resetKey,
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

	// Bulk "Separar e imprimir" (tab A separar, D7): claim em lote + abre o PDF
	// dos movidos. Refresh sempre — cada pedido é transação própria, então um
	// lote parcial (alguns puladas) ainda precisa refletir na lista.
	const runBulkPick = (ids: string[]) => {
		startPick(async () => {
			const result = await bulkStartPicking({ orderIds: ids });
			setRefreshTick((t) => t + 1);
			router.refresh();
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			const { kind, message } = buildBulkPickToast(
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

	// Ações do BulkActionBar por tab (D7/D8): A separar ganha o claim em lote +
	// a reimpressão sem claim; Separando só reimprime (nunca muda dono).
	const bulkActions: BulkAction[] =
		activeTab === "a_separar"
			? [
					{
						label: pickPending
							? "Separando…"
							: `Separar e imprimir (${sel.count})`,
						run: runBulkPick,
						variant: "default",
					},
					{
						label: `Imprimir lista (${sel.count})`,
						run: printSelected,
						variant: "outline",
					},
				]
			: [
					{
						label: `Imprimir lista (${sel.count})`,
						run: printSelected,
					},
				];

	return (
		<div>
			<PageHeader
				action={
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
				description="Fila de pedidos pagos aguardando conferência física"
				title="Separação"
			/>

			<SeparacaoTabs activeTab={activeTab} counts={counts} />

			{/* Grid de cards */}
			{(() => {
				if (items.length === 0 && !pending && !error) {
					return (
						<p className="py-10 text-center text-muted-foreground text-sm">
							{TAB_EMPTY[activeTab]}
						</p>
					);
				}
				const renderGrid = (rows: PickingQueueRow[]) => (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{rows.map((row) => (
							<SelectableItem
								active={selectable && sel.active}
								key={row.orderId}
								onToggle={() => sel.toggle(row.orderId)}
								selected={sel.isSelected(row.orderId)}
							>
								<PickingOrderCard
									canManageOthers={canManageOthers}
									row={row}
									sessionUserId={sessionUserId}
									tab={activeTab}
								/>
							</SelectableItem>
						))}
					</div>
				);
				if (activeTab === "a_separar") {
					return <div aria-live="polite">{renderGrid(items)}</div>;
				}
				// Tabs com dono: seções Minhas × Outros (mockup A). Seção vazia
				// não renderiza; o agrupamento fatia as páginas já carregadas
				// (fila ativa é pequena — aceito na spec).
				const labels = SECTION_LABELS[activeTab];
				const { mine, others } = splitQueueByOwnership(items, sessionUserId);
				return (
					<div aria-live="polite">
						{mine.length > 0 && (
							<>
								<QueueSectionHeader count={mine.length} label={labels.mine} />
								{renderGrid(mine)}
							</>
						)}
						{others.length > 0 && (
							<>
								<QueueSectionHeader
									count={others.length}
									label={labels.others}
								/>
								{renderGrid(others)}
							</>
						)}
					</div>
				);
			})()}

			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>

			{selectable && sel.count > 0 && (
				<BulkActionBar actions={bulkActions} selectedIds={sel.selectedIds} />
			)}
		</div>
	);
}
