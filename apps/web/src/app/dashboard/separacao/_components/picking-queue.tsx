"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";

type Tab = "a_separar" | "em_separacao" | "excecoes";

const BASE = "/dashboard/separacao";

const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido em separação no momento.",
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

	return (
		<div>
			{/* Tabs split: esquerda (fila principal) · direita (exceções) */}
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<Tabs value={activeTab}>
					<TabsList scrollable>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=a_separar`} />}
							value="a_separar"
						>
							A separar
							<TabsCountBadge value={counts.a_separar} />
						</TabsTrigger>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=em_separacao`} />}
							value="em_separacao"
						>
							Em separação
							<TabsCountBadge value={counts.em_separacao} />
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Tabs value={activeTab}>
					<TabsList>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=excecoes`} />}
							value="excecoes"
						>
							Exceções
							<TabsCountBadge value={counts.excecoes} />
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

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
						<PickingOrderCard key={row.orderId} row={row} tab={activeTab} />
					))}
				</div>
			)}

			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
