"use client";

import { Badge } from "@emach/ui/components/badge";

import { stockStatus } from "@/app/dashboard/stock/_components/stock-status";
import { getInitials } from "@/lib/format/name";
import type { ToolStockRow } from "../_lib/tool-detail-data";

interface ToolStockBranchCardProps {
	cell: ToolStockRow;
	onSelect: (cell: ToolStockRow) => void;
}

export function ToolStockBranchCard({
	cell,
	onSelect,
}: ToolStockBranchCardProps) {
	const status = stockStatus({
		quantity: cell.quantity,
		minQty: cell.minQty,
		reorderPoint: cell.reorderPoint,
	});

	let quantityColor = "text-foreground";
	if (status === "critical" || cell.quantity === 0) {
		quantityColor = "text-destructive";
	} else if (status === "reorder") {
		quantityColor = "text-amber-500";
	}

	const meta = [cell.branchCity, cell.branchState].filter(Boolean).join("/");

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => onSelect(cell)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(cell);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[8px] bg-muted font-semibold text-[13px] text-muted-foreground">
					{getInitials(cell.branchName)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[14px] text-foreground leading-tight tracking-tight">
						{cell.branchName}
					</p>
					{meta && (
						<p className="truncate text-muted-foreground text-xs">{meta}</p>
					)}
				</div>
				{status !== "none" && (
					<div className="flex-shrink-0">
						{status === "critical" && (
							<Badge variant="destructive">Crítico</Badge>
						)}
						{status === "reorder" && <Badge variant="warning">Repor</Badge>}
						{status === "ok" && <Badge variant="success">OK</Badge>}
					</div>
				)}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${quantityColor}`}
					>
						{cell.quantity}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Qtd
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{cell.minQty > 0 ? cell.minQty : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Mín
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{cell.reorderPoint > 0 ? cell.reorderPoint : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Repor
					</span>
				</div>
			</div>
		</div>
	);
}
