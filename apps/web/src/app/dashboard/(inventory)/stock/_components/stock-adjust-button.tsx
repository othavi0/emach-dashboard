"use client";

import { Button } from "@emach/ui/components/button";

interface StockAdjustButtonProps {
	branchId: string;
	branchName: string;
	currentQty: number;
	toolId: string;
}

// Placeholder for T-120 — will be replaced by full dialog component.
// For now: clicking does nothing. T-120 mounts the proper AdjustStockDialog
// and wires it to the adjustStock server action.
export function StockAdjustButton({
	branchName,
	currentQty,
}: StockAdjustButtonProps) {
	function handleClick() {
		// Placeholder — T-120 replaces this with dialog state management
		alert(
			`Ajuste de estoque para "${branchName}" (atual: ${currentQty}) — em breve`
		);
	}

	return (
		<Button onClick={handleClick} size="sm" variant="outline">
			Ajustar
		</Button>
	);
}
