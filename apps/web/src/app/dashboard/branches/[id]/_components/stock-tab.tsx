import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { BranchStockFilters } from "@/app/dashboard/stock/_components/branch-stock-filters";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import type { BranchStockTabData } from "../_lib/tab-actions";

interface StockTabProps {
	branchId: string;
	branchName: string;
	data: BranchStockTabData;
}

export function StockTab({ branchId, branchName, data }: StockTabProps) {
	const { categories, suppliers, filters, first, canMutate } = data;
	const basePath = `/dashboard/branches/${branchId}`;

	return (
		<div className="flex flex-col gap-4">
			<BranchStockFilters basePath={basePath} categories={categories} />

			{first.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta encontrada</EmptyTitle>
						<EmptyDescription>
							Tente ajustar os filtros ou limpe a busca.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href={`${basePath}?tab=stock`}
						>
							Limpar filtros
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockInfinite
					branchId={branchId}
					branchName={branchName}
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
					key={first.items
						.map(
							(i) =>
								`${i.variantId}:${i.quantity}:${i.minQty}:${i.reorderPoint}`
						)
						.join("|")}
					suppliers={suppliers}
				/>
			)}
		</div>
	);
}
