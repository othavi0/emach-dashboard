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
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { getActiveBranches } from "@/app/dashboard/branches/data";
import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { ToolFilters } from "./_components/tool-filters";
import { ToolsInfinite } from "./_components/tools-infinite";
import {
	fetchToolsPage,
	type ToolSort,
	type ToolsFiltersInput,
	type ToolsListMode,
} from "./data";

export const metadata: Metadata = {
	title: "Ferramentas",
};

interface PageProps {
	searchParams: Promise<{
		branchId?: string;
		categoryId?: string;
		mode?: string;
		ncm?: string;
		q?: string;
		search?: string;
		sort?: string;
		status?: string;
		visible?: string;
	}>;
}

async function fetchCategories() {
	return db
		.select({ id: category.id, name: category.name })
		.from(category)
		.orderBy(asc(category.path));
}

const VALID_SORTS: readonly ToolSort[] = ["newest", "name"];

export default async function ToolsPage({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect(
		"tools.read",
		"/dashboard/sem-acesso?recurso=Ferramentas"
	);
	const canMutate = await can(session, "tools.create");
	const params = await searchParams;
	const search = params.search ?? params.q;
	const sortParam = params.sort as ToolSort | undefined;
	const sort: ToolSort =
		sortParam && VALID_SORTS.includes(sortParam) ? sortParam : "newest";

	let mode: ToolsListMode | undefined;
	if (params.mode === "repor") {
		mode = "repor";
	} else if (params.mode === "catalog") {
		mode = "catalog";
	} else if (params.mode === "esgotado") {
		mode = "esgotado";
	}

	const filters: ToolsFiltersInput = {
		search,
		categoryId: params.categoryId,
		status: params.status,
		visible: params.visible,
		ncm: params.ncm,
		sort,
		mode,
		branchId: params.branchId,
	};

	const [first, categories, branches] = await Promise.all([
		fetchToolsPage({ filters, cursor: null }),
		fetchCategories(),
		getActiveBranches(),
	]);

	const hasFilters = Boolean(
		search ||
			params.visible ||
			params.status ||
			params.categoryId ||
			params.ncm ||
			params.mode ||
			params.branchId
	);
	const isEmpty = first.items.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/tools/new"
						>
							Nova ferramenta
						</Link>
					) : null
				}
				description="Gerencie o catálogo de ferramentas e suas configurações de exibição."
				title="Ferramentas"
			/>

			<ToolFilters branches={branches} categories={categories} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta encontrada</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar os filtros para encontrar o que procura."
								: "Comece cadastrando sua primeira ferramenta no catálogo."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/tools"
							>
								Limpar filtros
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/tools/new"
								>
									Nova ferramenta
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<ToolsInfinite
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
