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

import type { ToolStockRow } from "../_lib/tool-detail-data";

interface EstoqueLegacyTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
}

export function EstoqueLegacyTab({
	canMutate,
	stockRows,
	toolId,
}: EstoqueLegacyTabProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					Estoque atual por variante × filial. A matriz editável e a ação de
					ajuste virão numa próxima entrega — por enquanto, abra "Gerenciar
					estoque" pra ajustar.
				</p>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default", size: "sm" })}
						href={`/dashboard/tools/${toolId}/stock`}
					>
						Gerenciar estoque →
					</Link>
				)}
			</div>
			{stockRows.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground text-sm">
					Sem estoque registrado.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead>Filial</TableHead>
							<TableHead className="text-right">Quantidade</TableHead>
							<TableHead className="text-right">Mín · Repor</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{stockRows.map((r) => (
							<TableRow key={`${r.variantId}-${r.branchId}`}>
								<TableCell className="font-mono text-xs">
									{r.variantSku}
								</TableCell>
								<TableCell>{r.variantVoltage}</TableCell>
								<TableCell>{r.branchName}</TableCell>
								<TableCell className="text-right tabular-nums">
									{r.quantity}
								</TableCell>
								<TableCell className="text-right text-muted-foreground text-xs tabular-nums">
									{r.minQty} · {r.reorderPoint}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
