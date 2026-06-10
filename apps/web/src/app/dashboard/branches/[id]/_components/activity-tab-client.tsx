"use client";

import { Button } from "@emach/ui/components/button";
import { useMemo, useState } from "react";

import { fetchBranchActivityPage } from "@/app/dashboard/branches/actions";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import type {
	BranchActivityFilters,
	BranchActivityKind,
	BranchActivityPeriod,
	BranchActivityRow,
} from "../activity-data";
import { BranchActivityFilters as Filters } from "./branch-activity-filters";
import { BranchActivityTimeline } from "./branch-activity-timeline";

const ALL_KINDS: BranchActivityKind[] = ["stock", "order", "user"];

interface Props {
	branchId: string;
	initialCursor: string | null;
	initialItems: BranchActivityRow[];
	initialKinds: BranchActivityKind[];
	initialPeriod: BranchActivityPeriod;
	initialToolId?: string;
	tools: Array<{ id: string; name: string }>;
}

export function ActivityTabClient({
	branchId,
	initialCursor,
	initialItems,
	initialKinds,
	initialPeriod,
	initialToolId,
	tools,
}: Props) {
	const [period, setPeriod] = useState<BranchActivityPeriod>(initialPeriod);
	const [kinds, setKinds] = useState<BranchActivityKind[]>(initialKinds);
	const [toolId, setToolId] = useState<string | undefined>(initialToolId);

	const filters = useMemo<BranchActivityFilters>(
		() => ({ branchId, period, kinds, toolId }),
		[branchId, period, kinds, toolId]
	);

	const resetKey = JSON.stringify(filters);

	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchBranchActivityPage(filters, cursor),
		resetKey,
	});

	const isFiltered =
		period !== "30d" || kinds.length !== ALL_KINDS.length || !!toolId;

	function toggleKind(kind: BranchActivityKind) {
		setKinds((prev) =>
			prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
		);
	}

	function resetFilters() {
		setPeriod("30d");
		setKinds([...ALL_KINDS]);
		setToolId(undefined);
	}

	let body: React.ReactNode;
	if (items.length === 0 && pending) {
		body = (
			<div className="flex items-center justify-center rounded-md border border-border py-12">
				<InfiniteSentinel
					error={null}
					hasMore={false}
					onLoadMore={loadMore}
					pending={true}
				/>
			</div>
		);
	} else if (items.length === 0) {
		let emptyMessage = "Sem atividade registrada nesta filial.";
		if (kinds.length === 0) {
			emptyMessage = "Selecione ao menos um tipo de evento.";
		} else if (isFiltered) {
			emptyMessage = "Sem atividade pra esses filtros.";
		}
		body = (
			<div className="flex flex-col items-center gap-2 rounded-md border border-border py-12 text-center">
				<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				{isFiltered && kinds.length > 0 ? (
					<Button onClick={resetFilters} size="sm" variant="ghost">
						Limpar filtros
					</Button>
				) : null}
			</div>
		);
	} else {
		body = (
			<>
				<BranchActivityTimeline rows={items} />
				<InfiniteSentinel
					error={error}
					hasMore={hasMore}
					onLoadMore={loadMore}
					pending={pending}
				/>
			</>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<Filters
				kinds={kinds}
				onKindToggle={toggleKind}
				onPeriodChange={setPeriod}
				onToolChange={setToolId}
				period={period}
				toolId={toolId}
				tools={tools}
			/>
			{body}
		</div>
	);
}
