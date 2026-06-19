"use client";

import type { BranchStockRow } from "../branch-stock-data";

// ─── StatCard ────────────────────────────────────────────────────────────────

export function StatCard({
	label,
	value,
	colorClass = "text-foreground",
}: {
	colorClass?: string;
	label: string;
	value: number | string;
}) {
	return (
		<div className="rounded-[9px] border border-border bg-card px-2 py-2.5 text-center">
			<div
				className={`font-bold text-[22px] tabular-nums leading-none ${colorClass}`}
			>
				{value}
			</div>
			<div className="mt-1.5 text-[9.5px] text-muted-foreground uppercase tracking-wider">
				{label}
			</div>
		</div>
	);
}

// ─── StatsPanel ──────────────────────────────────────────────────────────────

export interface StatsPanelProps {
	available: number | null;
	quantityColor: string;
	reservedQty: number | null;
	row: BranchStockRow;
}

export function StatsPanel({
	available,
	quantityColor,
	reservedQty,
	row,
}: StatsPanelProps) {
	const availableColor =
		available !== null && available <= 0 ? "text-destructive" : "text-success";

	return (
		<div className="flex-none border-border border-b px-6 py-5">
			<p className="mb-3 text-muted-foreground text-xs uppercase tracking-wide">
				Estoque atual
			</p>
			<div className="grid grid-cols-4 gap-2">
				<StatCard
					colorClass={quantityColor}
					label="Atual"
					value={row.quantity}
				/>
				<StatCard label="Mínimo" value={row.minQty} />
				<StatCard label="Reposição" value={row.reorderPoint} />
				<StatCard
					colorClass={availableColor}
					label="Disponível"
					value={available ?? "—"}
				/>
			</div>
			{reservedQty !== null && reservedQty > 0 ? (
				<p className="mt-3 text-muted-foreground text-xs">
					<span className="font-semibold text-warning tabular-nums">
						{reservedQty}
					</span>{" "}
					reservado{reservedQty === 1 ? "" : "s"} em pedidos pagos/em preparo.
				</p>
			) : null}
		</div>
	);
}
