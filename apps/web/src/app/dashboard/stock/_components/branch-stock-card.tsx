"use client";

import { Badge } from "@emach/ui/components/badge";
import { useRouter } from "next/navigation";

import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockCardProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	row: BranchStockRow;
}

type StockStatus = "critical" | "reorder" | "ok" | "none";

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

export function BranchStockCard({
	branchId,
	branchName,
	canMutate,
	row,
}: BranchStockCardProps) {
	const router = useRouter();
	const status = stockStatus(row);
	const quantityIsCritical = status === "critical";
	const hasThresholds = row.minQty > 0 || row.reorderPoint > 0;

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/tools/${row.toolId}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/tools/${row.toolId}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Imagem com badge de status sobreposto */}
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
			<div className="flex flex-col gap-2 px-4 pt-3 pb-4">
				<div>
					<span className="line-clamp-2 font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight">
						{row.toolName}
					</span>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						SKU {row.sku}
						{row.voltage ? ` · ${row.voltage}` : ""}
					</p>
				</div>

				<hr className="border-border" />

				{/* Rodapé */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-baseline gap-1">
						<span className="text-muted-foreground text-xs">Qtd:</span>
						<span
							className={`font-semibold text-[15px] tabular-nums leading-none ${
								quantityIsCritical ? "text-destructive" : "text-primary"
							}`}
						>
							{row.quantity}
						</span>
					</div>
					{canMutate && (
						<div
							className="flex shrink-0 items-center gap-1.5"
							onClick={(e) => e.stopPropagation()}
						>
							<StockAdjustButton
								branchId={branchId}
								branchName={branchName}
								currentQty={row.quantity}
								variantId={row.variantId}
							/>
						</div>
					)}
				</div>

				{/* Thresholds */}
				{canMutate && hasThresholds && (
					<div onClick={(e) => e.stopPropagation()}>
						<BranchStockThresholdInputs
							branchId={branchId}
							initialMinQty={row.minQty}
							initialReorderPoint={row.reorderPoint}
							variantId={row.variantId}
						/>
					</div>
				)}
				{!canMutate && hasThresholds && (
					<p className="text-[11px] text-muted-foreground/60">
						Mín: {row.minQty} · Reposição: {row.reorderPoint}
					</p>
				)}
			</div>
		</div>
	);
}
