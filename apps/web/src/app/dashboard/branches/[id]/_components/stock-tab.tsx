import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { BranchStockFilters } from "@/app/dashboard/stock/_components/branch-stock-filters";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
} from "@/app/dashboard/stock/branch-stock-data";
import { can, requireCapabilityWithContextOrRedirect } from "@/lib/permissions";
import { getActiveSuppliers } from "@/lib/suppliers";

interface StockTabProps {
	branchId: string;
	branchName: string;
	categoryId?: string;
	search?: string;
	sort?: string;
	status?: string;
}

const SORT_MAP: Record<string, BranchStockSort> = {
	name: "name",
	"stock-low": "stockLow",
	"stock-high": "stockHigh",
};

const STATUS_MAP: Record<string, BranchStockStatus> = {
	critical: "critical",
	reorder: "reorder",
	ok: "ok",
};

export async function StockTab({
	branchId,
	branchName,
	categoryId,
	search,
	sort,
	status,
}: StockTabProps) {
	const session = await requireCapabilityWithContextOrRedirect("stock.adjust", {
		targetBranchIds: [branchId],
	});
	const canMutate = can(session.user.role, "stock.adjust");

	const [categories, suppliers] = await Promise.all([
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
		getActiveSuppliers(),
	]);

	const basePath = `/dashboard/branches/${branchId}`;

	const filters: BranchStockFiltersInput = {
		branchId,
		categoryId: categoryId || undefined,
		search: search?.trim() || undefined,
		sort: SORT_MAP[sort ?? ""] ?? "urgency",
		status: STATUS_MAP[status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

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
