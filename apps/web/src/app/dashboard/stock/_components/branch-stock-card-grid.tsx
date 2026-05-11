import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockCard } from "./branch-stock-card";

interface BranchStockCardGridProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	rows: BranchStockRow[];
}

export function BranchStockCardGrid({
	branchId,
	branchName,
	canMutate,
	rows,
}: BranchStockCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{rows.map((row) => (
				<BranchStockCard
					branchId={branchId}
					branchName={branchName}
					canMutate={canMutate}
					key={row.variantId}
					row={row}
				/>
			))}
		</div>
	);
}
