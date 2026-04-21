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
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockTableProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	rows: BranchStockRow[];
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
						<TableHead className="w-36 text-right">Ações</TableHead>
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
						<TableCell className="text-right font-mono">
							{row.quantity}
						</TableCell>
						{canMutate && (
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
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
