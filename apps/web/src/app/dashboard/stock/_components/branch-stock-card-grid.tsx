import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockCard } from "./branch-stock-card";

interface BranchStockCardGridProps {
	onSelect: (row: BranchStockRow) => void;
	rows: BranchStockRow[];
}

export function BranchStockCardGrid({
	onSelect,
	rows,
}: BranchStockCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{rows.map((row) => (
				<BranchStockCard key={row.variantId} onSelect={onSelect} row={row} />
			))}
		</div>
	);
}
