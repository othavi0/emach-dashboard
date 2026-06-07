"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useMemo, useState } from "react";

import {
	fetchToolActivityPage,
	type PeriodPreset,
	type ToolActivityFilters,
	type ToolActivityRow,
} from "@/app/dashboard/stock/actions";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { ActivityFilters } from "./activity-filters";
import { ActivityTimeline } from "./activity-timeline";

const ALL_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;

interface Props {
	branches: Array<{ id: string; name: string }>;
	initialCursor: string | null;
	initialItems: ToolActivityRow[];
	toolId: string;
}

export function ActivityTabClient({
	branches,
	initialCursor,
	initialItems,
	toolId,
}: Props) {
	const [period, setPeriod] = useState<PeriodPreset>("30d");
	const [branchId, setBranchId] = useState<string | undefined>();
	const [reasons, setReasons] = useState<string[]>([...ALL_REASONS]);

	const filters = useMemo<ToolActivityFilters>(
		() => ({ toolId, branchId, period, reasons }),
		[toolId, branchId, period, reasons]
	);

	const resetKey = JSON.stringify(filters);

	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchToolActivityPage(filters, cursor),
		resetKey,
	});

	const isFiltered =
		period !== "30d" || !!branchId || reasons.length !== ALL_REASONS.length;

	function toggleReason(reason: string) {
		setReasons((prev) =>
			prev.includes(reason)
				? prev.filter((r) => r !== reason)
				: [...prev, reason]
		);
	}

	function resetFilters() {
		setPeriod("30d");
		setBranchId(undefined);
		setReasons([...ALL_REASONS]);
	}

	let listContent: React.ReactNode;
	if (items.length === 0 && pending) {
		listContent = (
			<div className="flex items-center justify-center rounded-md border border-border py-12">
				<Spinner />
			</div>
		);
	} else if (items.length === 0) {
		listContent = (
			<div className="flex flex-col items-center gap-2 rounded-md border border-border py-12 text-center">
				<p className="text-muted-foreground text-sm">
					{isFiltered
						? "Sem movimentações pra esses filtros."
						: "Sem movimentações registradas."}
				</p>
				{isFiltered && (
					<Button onClick={resetFilters} size="sm" variant="ghost">
						Limpar filtros
					</Button>
				)}
			</div>
		);
	} else {
		listContent = (
			<>
				<ActivityTimeline rows={items} />
				{hasMore && (
					<Button
						className="self-center"
						disabled={pending}
						onClick={loadMore}
						size="sm"
						variant="outline"
					>
						{pending ? (
							<>
								<Spinner /> Carregando…
							</>
						) : (
							"Carregar mais"
						)}
					</Button>
				)}
				{error && (
					<p className="text-center text-destructive text-sm">{error}</p>
				)}
			</>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<ActivityFilters
				branches={branches}
				branchId={branchId}
				onBranchChange={setBranchId}
				onPeriodChange={setPeriod}
				onReasonToggle={toggleReason}
				period={period}
				reasons={reasons}
			/>

			{listContent}
		</div>
	);
}
