"use client";

import { useEffect, useState } from "react";

import { BranchStockEditSheet } from "@/app/dashboard/stock/_components/branch-stock-edit-sheet";
import type { BranchStockRow } from "@/app/dashboard/stock/branch-stock-data";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { groupStockByVariant } from "../_lib/stock-grouping";
import { fetchActiveSuppliersAction } from "../_lib/tab-actions";
import type { ToolDetailVariant, ToolStockRow } from "../_lib/tool-detail-data";
import { ToolStockBranchCard } from "./tool-stock-branch-card";

interface EstoqueTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
	toolImageUrl: string | null;
	toolName: string;
	variants: ToolDetailVariant[];
}

export function EstoqueTab({
	canMutate,
	stockRows,
	toolId,
	toolImageUrl,
	toolName,
	variants,
}: EstoqueTabProps) {
	const [selected, setSelected] = useState<ToolStockRow | null>(null);
	const [suppliers, setSuppliers] = useState<ActiveSupplierOption[]>([]);

	useEffect(() => {
		if (!selected) {
			return;
		}
		let active = true;
		fetchActiveSuppliersAction().then((data) => {
			if (active) {
				setSuppliers(data);
			}
		});
		return () => {
			active = false;
		};
	}, [selected]);

	const groups = groupStockByVariant(stockRows, variants);

	if (groups.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem variantes ou filiais com estoque registrado.
			</p>
		);
	}

	const selectedRow: BranchStockRow | null = selected
		? {
				barcode: selected.variantBarcode,
				imageUrl: toolImageUrl,
				minQty: selected.minQty,
				quantity: selected.quantity,
				reorderPoint: selected.reorderPoint,
				sku: selected.variantSku,
				toolId,
				toolName,
				variantId: selected.variantId,
				voltage: selected.variantVoltage,
			}
		: null;

	return (
		<div className="flex flex-col gap-6">
			{groups.map((group) => (
				<section key={group.variantId}>
					<div className="mb-3 flex flex-wrap items-center gap-2">
						<span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground text-xs">
							SKU {group.variantSku}
							{group.variantVoltage ? ` · ${group.variantVoltage}` : ""}
						</span>
						<span className="text-muted-foreground text-xs">
							{group.branches.reduce((sum, b) => sum + b.quantity, 0)} un ·{" "}
							{group.branches.length}{" "}
							{group.branches.length === 1 ? "filial" : "filiais"}
						</span>
					</div>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
						{group.branches.map((cell) => (
							<ToolStockBranchCard
								cell={cell}
								key={`${cell.variantId}:${cell.branchId}`}
								onSelect={setSelected}
							/>
						))}
					</div>
				</section>
			))}

			<BranchStockEditSheet
				branchId={selected?.branchId ?? ""}
				branchName={selected?.branchName ?? ""}
				canMutate={canMutate}
				lead="branch"
				onClose={() => setSelected(null)}
				row={selectedRow}
				suppliers={suppliers}
			/>
		</div>
	);
}
