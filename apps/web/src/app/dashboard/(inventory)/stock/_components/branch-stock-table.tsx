import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockTableProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	rows: BranchStockRow[];
}

function StockStatusBadge({
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
		return <Badge variant="secondary">Repor</Badge>;
	}
	return null;
}

export function BranchStockTable({
	branchId,
	branchName,
	canMutate,
	rows,
}: BranchStockTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Imagem</TableHead>
					<TableHead>Ferramenta</TableHead>
					<TableHead>SKU</TableHead>
					<TableHead className="text-right">Quantidade na filial</TableHead>
					{canMutate && (
						<>
							<TableHead className="text-right">Min · Reposição</TableHead>
							<TableHead className="w-36 text-right">Ações</TableHead>
						</>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.toolId}>
						<TableCell>
							{row.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: Supabase public URL
								// biome-ignore lint/correctness/useImageSize: fixed thumb via Tailwind
								<img
									alt={row.toolName}
									className="h-10 w-10 rounded border border-border object-cover"
									src={row.imageUrl}
								/>
							) : (
								<div className="h-10 w-10 rounded border border-border border-dashed" />
							)}
						</TableCell>
						<TableCell>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/tools/${row.toolId}`}
							>
								{row.toolName}
							</Link>
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{row.sku ?? "—"}
						</TableCell>
						<TableCell className="text-right">
							<div className="flex items-center justify-end gap-2">
								<StockStatusBadge
									minQty={row.minQty}
									quantity={row.quantity}
									reorderPoint={row.reorderPoint}
								/>
								<span className="font-mono">{row.quantity}</span>
							</div>
						</TableCell>
						{canMutate && (
							<>
								<TableCell className="text-right">
									<div className="flex justify-end">
										<BranchStockThresholdInputs
											branchId={branchId}
											initialMinQty={row.minQty}
											initialReorderPoint={row.reorderPoint}
											toolId={row.toolId}
										/>
									</div>
								</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<Link
											className={buttonVariants({ size: "sm", variant: "ghost" })}
											href={`/dashboard/tools/${row.toolId}/stock`}
										>
											Detalhes
										</Link>
										<StockAdjustButton
											branchId={branchId}
											branchName={branchName}
											currentQty={row.quantity}
											toolId={row.toolId}
										/>
									</div>
								</TableCell>
							</>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
