import { db } from "@emach/db";
import type { UserRole } from "@emach/db/schema/auth";
import { category } from "@emach/db/schema/categories";
import { branch } from "@emach/db/schema/inventory";
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

import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { ToolFilters } from "./_components/tool-filters";
import { ToolsInfinite } from "./_components/tools-infinite";
import {
	fetchToolsPage,
	type ToolSort,
	type ToolsFiltersInput,
	type ToolsListMode,
} from "./actions";

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

async function fetchActiveBranches() {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}

const VALID_SORTS: readonly ToolSort[] = ["newest", "name"];

export default async function ToolsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role as UserRole | null, "tools.create");
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
		fetchActiveBranches(),
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
