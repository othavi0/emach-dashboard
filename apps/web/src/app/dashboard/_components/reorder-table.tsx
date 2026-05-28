import type { ReorderRow } from "@emach/db/queries/dashboard";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";

export function ReorderTable({ rows }: { rows: ReorderRow[] }) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nenhum item abaixo do ponto de reposição.
			</p>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Filial</TableHead>
					<TableHead>Ferramenta</TableHead>
					<TableHead>SKU</TableHead>
					<TableHead className="text-right">Estoque</TableHead>
					<TableHead className="text-right">Ponto</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((r) => (
					<TableRow
						className={cn(r.quantity === 0 && "bg-destructive/5")}
						key={`${r.sku}-${r.branchName}`}
					>
						<TableCell>{r.branchName}</TableCell>
						<TableCell>
							<Link className="hover:underline" href="/dashboard/stock">
								{r.toolName}
							</Link>
						</TableCell>
						<TableCell className="font-mono text-xs">{r.sku}</TableCell>
						<TableCell
							className={cn(
								"text-right tabular-nums",
								r.quantity === 0 && "font-semibold text-destructive"
							)}
						>
							{r.quantity}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{r.reorderPoint}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
