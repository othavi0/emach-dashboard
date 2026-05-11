import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { Eye } from "lucide-react";
import Link from "next/link";

import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockCardProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	row: BranchStockRow;
}

function StatusBadge({
	minQty,
	quantity,
	reorderPoint,
}: {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}) {
	if (minQty > 0 && quantity <= minQty) {
		return <Badge variant="destructive">Crítico</Badge>;
	}
	if (reorderPoint > 0 && quantity > minQty && quantity <= reorderPoint) {
		return <Badge variant="warning">Repor</Badge>;
	}
	return null;
}

export function BranchStockCard({
	branchId,
	branchName,
	canMutate,
	row,
}: BranchStockCardProps) {
	const stockIsCritical = row.minQty > 0 && row.quantity <= row.minQty;

	return (
		<div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80">
			<div className="overflow-hidden rounded-[8px] border border-border">
				{row.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={row.toolName}
						className="aspect-[16/9] w-full object-cover"
						src={row.imageUrl}
					/>
				) : (
					<div className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
			</div>

			<div className="flex items-start justify-between gap-2">
				<Link
					className="line-clamp-1 rounded bg-muted px-2 py-0.5 text-xs hover:underline"
					href={`/dashboard/tools/${row.toolId}`}
					title={row.toolName}
				>
					{row.toolName}
				</Link>
				<StatusBadge
					minQty={row.minQty}
					quantity={row.quantity}
					reorderPoint={row.reorderPoint}
				/>
			</div>

			<h3 className="font-medium font-serif text-[15px] text-foreground leading-[1.3]">
				SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""}
			</h3>

			<hr className="border-border" />

			<div className="flex items-end justify-between gap-3">
				<div>
					<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Qtd nesta filial
					</div>
					<div
						className={`font-medium text-[26px] tabular-nums leading-none ${stockIsCritical ? "text-destructive" : "text-primary"}`}
					>
						{row.quantity}
					</div>
				</div>
				{canMutate && (
					<div>
						<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Min · Reposição
						</div>
						<div className="mt-1 flex justify-end">
							<BranchStockThresholdInputs
								branchId={branchId}
								initialMinQty={row.minQty}
								initialReorderPoint={row.reorderPoint}
								variantId={row.variantId}
							/>
						</div>
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-2 border-border border-t pt-3">
				<Link
					aria-label={`Ver detalhes de estoque de ${row.toolName}`}
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/tools/${row.toolId}/stock`}
				>
					<Eye aria-hidden className="size-3.5" />
					Ver
				</Link>
				{canMutate && (
					<StockAdjustButton
						branchId={branchId}
						branchName={branchName}
						currentQty={row.quantity}
						variantId={row.variantId}
					/>
				)}
			</div>
		</div>
	);
}
