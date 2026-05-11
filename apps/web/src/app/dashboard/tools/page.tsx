import { db } from "@emach/db";
import type { UserRole } from "@emach/db/schema/auth";
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
} from "./actions";

interface PageProps {
	searchParams: Promise<{
		categoryId?: string;
		ncm?: string;
		q?: string;
		search?: string;
		status?: string;
		visible?: string;
		sort?: string;
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
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role as UserRole | null, "tools.create");
	const params = await searchParams;
	const search = params.search ?? params.q;
	const sortParam = params.sort as ToolSort | undefined;
	const sort: ToolSort =
		sortParam && VALID_SORTS.includes(sortParam) ? sortParam : "newest";

	const filters: ToolsFiltersInput = {
		search,
		categoryId: params.categoryId,
		status: params.status,
		visible: params.visible,
		ncm: params.ncm,
		sort,
	};

	const [first, categories] = await Promise.all([
		fetchToolsPage({ filters, cursor: null }),
		fetchCategories(),
	]);

	const hasFilters = Boolean(
		search || params.visible || params.status || params.categoryId || params.ncm
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

			<ToolFilters categories={categories} />

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
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
