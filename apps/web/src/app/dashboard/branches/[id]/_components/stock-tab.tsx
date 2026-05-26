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
import { Ban, CheckCircle2, Clock, Package } from "lucide-react";
import Link from "next/link";

import { BranchStockFilters } from "@/app/dashboard/stock/_components/branch-stock-filters";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
	getBranchStockKpis,
} from "@/app/dashboard/stock/branch-stock-data";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { can, requireCapabilityWithContextOrRedirect } from "@/lib/permissions";

import { AddToolButton } from "../stock/_components/add-tool-button";

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

	const [categories, kpis] = await Promise.all([
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
		getBranchStockKpis(branchId),
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
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Ajuste quantidades e configure limites de alerta por ferramenta.
				</p>
				{canMutate ? (
					<AddToolButton branchId={branchId} branchName={branchName} />
				) : null}
			</div>

			<EntityKpisRow
				items={[
					{
						icon: Package,
						label: "Itens em estoque",
						value: kpis.totalItems,
					},
					{
						icon: Ban,
						label: "Críticas",
						tone: kpis.criticalCount > 0 ? "danger" : "default",
						value: kpis.criticalCount,
					},
					{
						icon: Clock,
						label: "A repor",
						tone: kpis.reorderCount > 0 ? "warning" : "default",
						value: kpis.reorderCount,
					},
					{ icon: CheckCircle2, label: "OK", value: kpis.okCount },
				]}
			/>

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
				/>
			)}
		</div>
	);
}
