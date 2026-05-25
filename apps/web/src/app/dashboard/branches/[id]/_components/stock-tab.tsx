import { Boxes } from "lucide-react";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	fetchBranchStockPage,
} from "@/app/dashboard/stock/branch-stock-data";
import { requireCurrentSession } from "@/lib/session";

interface StockTabProps {
	branchId: string;
	branchName: string;
}

export async function StockTab({ branchId, branchName }: StockTabProps) {
	const session = await requireCurrentSession();
	const canMutate =
		session.user.role === "admin" || session.user.role === "super_admin";

	const filters: BranchStockFiltersInput = {
		branchId,
		sort: "urgency",
	};
	const first = await fetchBranchStockPage({ filters, cursor: null });
	const rows = first.items;

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-center">
				<Boxes
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">Nenhuma ferramenta no estoque</p>
					<p className="text-muted-foreground text-xs">
						Cadastre ferramentas e ajuste o estoque para acompanhar esta filial.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<BranchStockInfinite
				branchName={branchName}
				canMutate={canMutate}
				filters={filters}
				initial={rows}
				initialCursor={first.nextCursor}
			/>
		</div>
	);
}
