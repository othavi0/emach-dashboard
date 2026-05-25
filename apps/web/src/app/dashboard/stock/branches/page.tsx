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
import { listBranches } from "@/app/dashboard/branches/actions";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";

import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

import { BranchStockFilters } from "../_components/branch-stock-filters";
import { BranchStockInfinite } from "../_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
} from "../branch-stock-data";

export const dynamic = "force-dynamic";

interface BranchesStockPageProps {
	searchParams: Promise<{
		branch?: string;
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

function branchHref(
	branchId: string,
	sp: {
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}
): string {
	const params = new URLSearchParams({ branch: branchId });
	if (sp.search) {
		params.set("search", sp.search);
	}
	if (sp.status) {
		params.set("status", sp.status);
	}
	if (sp.sort) {
		params.set("sort", sp.sort);
	}
	if (sp.categoryId) {
		params.set("categoryId", sp.categoryId);
	}
	return `/dashboard/stock/branches?${params.toString()}`;
}

export default async function BranchesStockPage({
	searchParams,
}: BranchesStockPageProps) {
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role, "stock.adjust");
	const sp = await searchParams;

	const scope = await getUserBranchScope(session);
	const [allBranches, categories] = await Promise.all([
		listBranches(),
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
	]);

	const branches =
		scope === null
			? allBranches
			: allBranches.filter((b) => scope.includes(b.id));

	const selectedBranch =
		branches.find((b) => b.id === sp.branch) ?? branches[0];

	if (!selectedBranch) {
		return (
			<>
				<PageHeader
					description="Consulte o estoque local de cada filial."
					title="Estoque por Filiais"
				/>
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma filial cadastrada</EmptyTitle>
						<EmptyDescription>
							Cadastre uma filial para acompanhar estoque separado por unidade.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Nova filial
						</Link>
					</EmptyContent>
				</Empty>
			</>
		);
	}

	const filters: BranchStockFiltersInput = {
		branchId: selectedBranch.id,
		categoryId: sp.categoryId || undefined,
		search: sp.search?.trim() || undefined,
		sort: SORT_MAP[sp.sort ?? ""] ?? "urgency",
		status: STATUS_MAP[sp.status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

	return (
		<>
			<PageHeader
				description="Selecione uma filial para ver e ajustar o estoque local de cada ferramenta."
				title="Estoque por Filiais"
			/>

			{/* Chips de filial */}
			<div className="flex gap-1.5 overflow-x-auto pb-0.5">
				{branches.map((b) => (
					<Link
						className={`flex-shrink-0 whitespace-nowrap rounded-[7px] border px-3.5 py-1.5 font-medium text-sm transition-colors ${
							b.id === selectedBranch.id
								? "border-border bg-card text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
						href={branchHref(b.id, sp)}
						key={b.id}
					>
						{b.name}
					</Link>
				))}
			</div>

			<BranchStockFilters categories={categories} />

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
							href={branchHref(selectedBranch.id, {})}
						>
							Limpar filtros
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockInfinite
					branchName={selectedBranch.name}
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
