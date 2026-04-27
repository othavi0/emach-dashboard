"use client";

import { AdjustStockDialog } from "./adjust-stock-dialog";

interface StockAdjustButtonProps {
	branchId: string;
	branchName: string;
	currentQty: number;
	toolId: string;
}

export function StockAdjustButton({
	branchId,
	branchName,
	currentQty,
	toolId,
}: StockAdjustButtonProps) {
	return (
		<AdjustStockDialog
			branchId={branchId}
			branchName={branchName}
			currentQty={currentQty}
			toolId={toolId}
		/>
	);
}
