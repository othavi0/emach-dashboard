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
import { notFound } from "next/navigation";

import { getBranchDetail } from "@/app/dashboard/branches/data";
import { BranchStockFilters } from "@/app/dashboard/stock/_components/branch-stock-filters";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
} from "@/app/dashboard/stock/branch-stock-data";
import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityWithContextOrRedirect } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}>;
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

export default async function BranchStockPage({
	params,
	searchParams,
}: PageProps) {
	const { id } = await params;
	const session = await requireCapabilityWithContextOrRedirect("stock.adjust", {
		targetBranchIds: [id],
	});
	const canMutate = can(session.user.role, "stock.adjust");
	const sp = await searchParams;

	const [detail, categories] = await Promise.all([
		getBranchDetail(id),
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
	]);

	if (!detail) {
		notFound();
	}

	const basePath = `/dashboard/branches/${id}/stock`;

	const filters: BranchStockFiltersInput = {
		branchId: id,
		categoryId: sp.categoryId || undefined,
		search: sp.search?.trim() || undefined,
		sort: SORT_MAP[sp.sort ?? ""] ?? "urgency",
		status: STATUS_MAP[sp.status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

	return (
		<>
			<PageHeader
				description="Ajuste quantidades e configure limites de alerta por ferramenta."
				title={`Estoque — ${detail.name}`}
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
							href={basePath}
						>
							Limpar filtros
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockInfinite
					branchId={id}
					branchName={detail.name}
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
