import { PackageOpen } from "lucide-react";

import { fetchBranchOrdersPage } from "../../actions";
import { BranchOrdersInfinite } from "./branch-orders-infinite";

export async function OrdersTab({ branchId }: { branchId: string }) {
	const first = await fetchBranchOrdersPage({ branchId, cursor: null });

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<PackageOpen
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem pedidos</p>
				<p className="text-muted-foreground text-xs">
					Esta filial ainda não atendeu pedidos.
				</p>
			</div>
		);
	}

	return (
		<BranchOrdersInfinite
			branchId={branchId}
			initial={first.items}
			initialCursor={first.nextCursor}
		/>
	);
}
