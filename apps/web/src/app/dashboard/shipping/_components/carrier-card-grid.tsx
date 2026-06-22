"use client";

import { Truck } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCarriersPage } from "../actions";
import type { CarrierBaseRow } from "../data";
import { CarrierCard } from "./carrier-card";

interface CarrierCardGridProps {
	initial: CarrierBaseRow[];
	initialCursor: string | null;
}

export function CarrierCardGrid({
	initial,
	initialCursor,
}: CarrierCardGridProps) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchCarriersPage({ cursor }),
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Truck aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhuma transportadora cadastrada</p>
				<p className="text-muted-foreground text-xs">
					Clique em "Nova transportadora" para adicionar a primeira.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((c) => (
					<CarrierCard carrier={c} key={c.id} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
