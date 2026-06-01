"use client";

import { Badge } from "@emach/ui/components/badge";
import Link from "next/link";

import type { BranchStockRow } from "../branch-stock-data";

interface BranchStockCardProps {
	onSelect: (row: BranchStockRow) => void;
	row: BranchStockRow;
}

type StockStatus = "critical" | "none" | "ok" | "reorder";

function stockStatus(row: BranchStockRow): StockStatus {
	if (row.minQty > 0 && row.quantity <= row.minQty) {
		return "critical";
	}
	if (
		row.reorderPoint > 0 &&
		row.quantity > row.minQty &&
		row.quantity <= row.reorderPoint
	) {
		return "reorder";
	}
	if (row.minQty === 0 && row.reorderPoint === 0) {
		return "none";
	}
	return "ok";
}

export function BranchStockCard({ onSelect, row }: BranchStockCardProps) {
	const status = stockStatus(row);

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => onSelect(row)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(row);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Imagem com badge de status */}
			<div className="relative overflow-hidden">
				{row.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={row.toolName}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						src={row.imageUrl}
					/>
				) : (
					<div
						aria-hidden
						className="aspect-[16/9] w-full border-dashed bg-muted/40"
					/>
				)}
				{status !== "none" && (
					<div className="absolute top-2 right-2">
						{status === "critical" && (
							<Badge
								className="shadow-sm backdrop-blur-sm"
								variant="destructive"
							>
								Crítico
							</Badge>
						)}
						{status === "reorder" && (
							<Badge className="shadow-sm backdrop-blur-sm" variant="warning">
								Repor
							</Badge>
						)}
						{status === "ok" && (
							<Badge className="shadow-sm backdrop-blur-sm" variant="success">
								OK
							</Badge>
						)}
					</div>
				)}
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pt-3 pb-3">
				<div>
					<Link
						className="line-clamp-2 block font-sans font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight hover:underline"
						href={`/dashboard/tools/${row.toolId}?tab=estoque`}
						onClick={(e) => e.stopPropagation()}
					>
						{row.toolName}
					</Link>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						SKU {row.sku}
						{row.voltage ? ` · ${row.voltage}` : ""}
					</p>
				</div>
			</div>

			{/* Footer de 3 métricas (espelha o card de filial) */}
			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${
							status === "critical" || row.quantity === 0
								? "text-destructive"
								: status === "reorder"
									? "text-amber-500"
									: "text-foreground"
						}`}
					>
						{row.quantity}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Qtd
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{row.minQty > 0 ? row.minQty : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Mín
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{row.reorderPoint > 0 ? row.reorderPoint : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Repor
					</span>
				</div>
			</div>
		</div>
	);
}
