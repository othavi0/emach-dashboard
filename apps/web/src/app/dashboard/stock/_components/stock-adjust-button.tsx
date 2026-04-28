"use client";

import { AdjustStockDialog } from "./adjust-stock-dialog";

interface StockAdjustButtonProps {
	branchId: string;
	branchName: string;
	currentQty: number;
	variantId: string;
}

export function StockAdjustButton({
	branchId,
	branchName,
	currentQty,
	variantId,
}: StockAdjustButtonProps) {
	return (
		<AdjustStockDialog
			branchId={branchId}
			branchName={branchName}
			currentQty={currentQty}
			variantId={variantId}
		/>
	);
}
