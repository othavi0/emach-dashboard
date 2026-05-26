"use client";

import { Button } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";

import type { ToolDetailVariant, ToolStockRow } from "../_lib/tool-detail-data";
import { StockCellSheet } from "./stock-cell-sheet";

interface EstoqueTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
	variants: ToolDetailVariant[];
}

interface SelectedCell {
	branchId: string;
	branchName: string;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

interface CellData {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

function cellStatus(
	c: CellData | undefined
): "critical" | "reorder" | "ok" | "none" {
	if (!c) {
		return "none";
	}
	if (c.reorderPoint <= 0) {
		return "none";
	}
	if (c.minQty > 0 && c.quantity <= c.minQty) {
		return "critical";
	}
	if (c.quantity <= c.reorderPoint) {
		return "reorder";
	}
	return "ok";
}

function cellClass(status: ReturnType<typeof cellStatus>): string {
	switch (status) {
		case "critical":
			return "bg-destructive/15 border-b-2 border-destructive";
		case "reorder":
			return "bg-warning/15 border-b-2 border-warning";
		default:
			return "";
	}
}

export function EstoqueTab({
	stockRows,
	variants,
	toolId,
	canMutate,
}: EstoqueTabProps) {
	const [selected, setSelected] = useState<SelectedCell | null>(null);

	const branches = useMemo(() => {
		const seen = new Map<string, string>();
		for (const r of stockRows) {
			if (!seen.has(r.branchId)) {
				seen.set(r.branchId, r.branchName);
			}
		}
		return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
	}, [stockRows]);

	const cellMap = useMemo(() => {
		const m = new Map<string, CellData>();
		for (const r of stockRows) {
			m.set(`${r.variantId}:${r.branchId}`, {
				quantity: r.quantity,
				minQty: r.minQty,
				reorderPoint: r.reorderPoint,
			});
		}
		return m;
	}, [stockRows]);

	const variantTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const v of variants) {
			let sum = 0;
			for (const b of branches) {
				sum += cellMap.get(`${v.id}:${b.id}`)?.quantity ?? 0;
			}
			totals.set(v.id, sum);
		}
		return totals;
	}, [variants, branches, cellMap]);

	const branchTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const b of branches) {
			let sum = 0;
			for (const v of variants) {
				sum += cellMap.get(`${v.id}:${b.id}`)?.quantity ?? 0;
			}
			totals.set(b.id, sum);
		}
		return totals;
	}, [variants, branches, cellMap]);

	const grandTotal = useMemo(() => {
		let sum = 0;
		for (const v of variantTotals.values()) {
			sum += v;
		}
		return sum;
	}, [variantTotals]);

	if (variants.length === 0 || branches.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem variantes ou filiais com estoque registrado.
			</p>
		);
	}

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-end">
					<Tooltip>
						<TooltipTrigger>
							<Button disabled size="sm" variant="outline">
								<ArrowLeftRight className="mr-1.5 size-3.5" />
								Transferir entre filiais
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							Em breve — requer mudança de schema (ADR separada).
						</TooltipContent>
					</Tooltip>
				</div>

				<div className="overflow-x-auto rounded-md border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[180px]">Variante</TableHead>
								{branches.map((b) => (
									<TableHead className="text-center" key={b.id}>
										{b.name}
									</TableHead>
								))}
								<TableHead className="bg-muted/40 text-right">Total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{variants.map((v) => (
								<TableRow key={v.id}>
									<TableCell>
										<div className="font-mono text-xs">{v.sku}</div>
										<div className="text-[10px] text-muted-foreground">
											{v.voltage ?? "—"} {v.isDefault && "· padrão"}
										</div>
									</TableCell>
									{branches.map((b) => {
										const data = cellMap.get(`${v.id}:${b.id}`);
										const status = cellStatus(data);
										return (
											<TableCell
												className={`cursor-pointer p-0 text-center ${cellClass(status)}`}
												key={b.id}
												onClick={() =>
													canMutate &&
													setSelected({
														variantId: v.id,
														variantSku: v.sku,
														variantVoltage: v.voltage,
														branchId: b.id,
														branchName: b.name,
													})
												}
											>
												<div className="py-3">
													<div className="font-semibold text-lg tabular-nums">
														{data ? data.quantity : "—"}
													</div>
													<div className="text-[10px] text-muted-foreground">
														{data && data.reorderPoint > 0
															? `mín ${data.minQty} · rep ${data.reorderPoint}`
															: "sem limites"}
													</div>
												</div>
											</TableCell>
										);
									})}
									<TableCell className="bg-muted/40 text-right font-semibold tabular-nums">
										{variantTotals.get(v.id) ?? 0}
									</TableCell>
								</TableRow>
							))}
							<TableRow className="bg-muted/40">
								<TableCell className="text-muted-foreground text-xs uppercase">
									Total
								</TableCell>
								{branches.map((b) => (
									<TableCell
										className="text-center font-semibold tabular-nums"
										key={b.id}
									>
										{branchTotals.get(b.id) ?? 0}
									</TableCell>
								))}
								<TableCell className="bg-muted text-right font-semibold tabular-nums">
									{grandTotal}
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</div>

				<div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm bg-destructive/15 align-middle ring-1 ring-destructive" />
						Crítico (≤ mín)
					</span>
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm bg-warning/15 align-middle ring-1 ring-warning" />
						Repor (≤ ponto)
					</span>
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm border border-border align-middle" />
						OK
					</span>
				</div>

				{selected && (
					<StockCellSheet
						branchId={selected.branchId}
						branchName={selected.branchName}
						canMutate={canMutate}
						initial={cellMap.get(`${selected.variantId}:${selected.branchId}`)}
						onClose={() => setSelected(null)}
						toolId={toolId}
						variantId={selected.variantId}
						variantSku={selected.variantSku}
						variantVoltage={selected.variantVoltage}
					/>
				)}
			</div>
		</TooltipProvider>
	);
}
