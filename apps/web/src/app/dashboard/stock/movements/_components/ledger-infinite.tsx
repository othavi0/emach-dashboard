"use client";

import { cn } from "@emach/ui/lib/utils";
import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";
import Link from "next/link";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatDateTime } from "@/lib/format/datetime";
import { useInfiniteList } from "@/lib/use-infinite-list";

import type { LedgerFilters, LedgerRow } from "../../movements-data";
import { fetchLedgerPageAction } from "../actions";

const REASON_LABEL: Record<string, string> = {
	entrada_compra: "Entrada compra",
	saida_venda: "Saída venda",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

function reasonIcon(reason: string | null) {
	switch (reason) {
		case "entrada_compra":
			return { Icon: ArrowUp, color: "text-success", bg: "bg-success/15" };
		case "saida_venda":
			return {
				Icon: ArrowDown,
				color: "text-destructive",
				bg: "bg-destructive/15",
			};
		case "perda":
			return { Icon: X, color: "text-destructive", bg: "bg-destructive/15" };
		case "ajuste_inventario":
			return { Icon: Pencil, color: "text-warning", bg: "bg-warning/15" };
		default:
			return { Icon: Pencil, color: "text-muted-foreground", bg: "bg-muted" };
	}
}

function LedgerRowItem({ row }: { row: LedgerRow }) {
	const { Icon, color, bg } = reasonIcon(row.reason);
	const reasonLabel = REASON_LABEL[row.reason ?? ""] ?? row.reason ?? "—";
	const deltaPositive = row.delta >= 0;

	return (
		<li className="flex items-start gap-3 px-4 py-3 text-sm">
			<span
				className={`mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full ${bg}`}
			>
				<Icon className={`size-3.5 ${color}`} />
			</span>

			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
					<span
						className={cn(
							"font-semibold tabular-nums",
							deltaPositive ? "text-success" : "text-destructive"
						)}
					>
						{row.delta > 0 ? `+${row.delta}` : row.delta}
					</span>

					<span className="text-muted-foreground">·</span>
					<span className="font-medium">{reasonLabel}</span>

					{row.toolId ? (
						<>
							<span className="text-muted-foreground">·</span>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/tools/${row.toolId}`}
							>
								{row.toolName ?? "—"}
							</Link>
							{row.variantSku ? (
								<span className="font-mono text-muted-foreground text-xs">
									{row.variantSku}
								</span>
							) : null}
						</>
					) : (
						<>
							<span className="text-muted-foreground">·</span>
							<span className="text-muted-foreground italic">
								Ferramenta removida
							</span>
						</>
					)}

					{row.branchName ? (
						<>
							<span className="text-muted-foreground">·</span>
							<span className="text-muted-foreground">{row.branchName}</span>
						</>
					) : null}

					{row.reason === "entrada_compra" && row.supplierName ? (
						<>
							<span className="text-muted-foreground">·</span>
							<span className="text-muted-foreground text-xs">
								Fornecedor: {row.supplierName}
							</span>
						</>
					) : null}
				</div>

				<div className="flex flex-wrap items-baseline gap-x-1 text-muted-foreground text-xs">
					<span className="tabular-nums">
						{row.previousQty} → {row.newQty} un.
					</span>
					{row.reasonNote ? (
						<>
							<span>·</span>
							<span>&quot;{row.reasonNote}&quot;</span>
						</>
					) : null}
					{row.actorName ? (
						<>
							<span>·</span>
							<span>por {row.actorName}</span>
						</>
					) : (
						<>
							<span>·</span>
							<span>Sistema</span>
						</>
					)}
				</div>
			</div>

			<span className="flex-shrink-0 text-muted-foreground text-xs tabular-nums">
				{formatDateTime(row.createdAt)}
			</span>
		</li>
	);
}

interface LedgerInfiniteProps {
	filters: LedgerFilters;
	initial: LedgerRow[];
	initialCursor: string | null;
}

export function LedgerInfinite({
	initial,
	initialCursor,
	filters,
}: LedgerInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchLedgerPageAction(filters, cursor),
		resetKey,
	});

	if (items.length === 0 && !pending) {
		return (
			<div className="rounded-md border border-border py-12 text-center text-muted-foreground text-sm">
				Nenhuma movimentação encontrada para os filtros selecionados.
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="rounded-md border border-border">
				<ul className="divide-y divide-border">
					{items.map((row) => (
						<LedgerRowItem key={row.id} row={row} />
					))}
				</ul>
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
