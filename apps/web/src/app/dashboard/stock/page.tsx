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
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { StockFilters } from "./_components/stock-filters";
import { StockInfinite } from "./_components/stock-infinite";
import {
	fetchStockPage,
	type StockFiltersInput,
	type StockSort,
} from "./actions";

export const dynamic = "force-dynamic";

interface StockPageParams {
	categoryId?: string;
	ordem?: string;
	q?: string;
	search?: string;
}

interface StockPageProps {
	searchParams: Promise<StockPageParams>;
}

const SORT_MAP: Record<string, StockSort> = {
	urgencia: "urgency",
	"mais-nova": "newest",
	nome: "name",
	maior: "stockHigh",
	menor: "stockLow",
};

async function fetchCategories() {
	return await db
		.select({
			id: category.id,
			name: category.name,
			path: category.path,
			depth: category.depth,
		})
		.from(category)
		.orderBy(asc(category.path));
}

export default async function StockPage({ searchParams }: StockPageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin" || role === "manager";
	const params = await searchParams;
	const search = params.search ?? params.q;
	const sort: StockSort = (params.ordem && SORT_MAP[params.ordem]) || "urgency";

	const filters: StockFiltersInput = {
		search,
		categoryId: params.categoryId,
		sort,
	};

	const [first, categories] = await Promise.all([
		fetchStockPage({ filters, cursor: null }),
		fetchCategories(),
	]);

	const isEmpty = first.items.length === 0;
	const hasFilters = Boolean(search || params.categoryId || params.ordem);

	return (
		<>
			<PageHeader
				description="Visão centralizada do estoque de cada ferramenta somando todas as filiais. Use a ação na tabela para abrir o ajuste por filial."
				title="Estoque Geral"
			/>

			<StockFilters categories={categories} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhuma ferramenta encontrada"
								: "Nenhuma ferramenta cadastrada"}
						</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar os filtros para encontrar o que procura."
								: "Crie ferramentas em /dashboard/tools para começar a acompanhar o estoque."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/stock"
							>
								Limpar filtros
							</Link>
						) : (
							<Link
								className={buttonVariants({ variant: "default" })}
								href="/dashboard/tools/new"
							>
								Nova ferramenta
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<StockInfinite
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
