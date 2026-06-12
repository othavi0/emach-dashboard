export type StockStatus = "critical" | "none" | "ok" | "reorder";

export interface StockStatusInput {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

/** Regra única de status de estoque (usada por cards e drawer). */
export function stockStatus({
	quantity,
	minQty,
	reorderPoint,
}: StockStatusInput): StockStatus {
	if (minQty > 0 && quantity <= minQty) {
		return "critical";
	}
	if (reorderPoint > 0 && quantity > minQty && quantity <= reorderPoint) {
		return "reorder";
	}
	if (minQty === 0 && reorderPoint === 0) {
		return "none";
	}
	return "ok";
}
