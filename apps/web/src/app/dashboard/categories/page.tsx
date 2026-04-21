import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";
import { CategoriesFilter } from "./_components/categories-filter";
import { CategoriesTable } from "./_components/categories-table";
import { listCategories } from "./actions";

interface PageProps {
	searchParams: Promise<{
		search?: string;
	}>;
}

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const params = await searchParams;
	const search = params.search ?? "";
	const categories = await listCategories({ search: search || undefined });
	const hasFilters = Boolean(search);
	const isEmpty = categories.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Categorias</h1>
					<p className="text-muted-foreground text-sm">
						Organize o catálogo de ferramentas por tipo de produto.
					</p>
				</div>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/categories/new"
					>
						Nova categoria
					</Link>
				)}
			</div>

			<CategoriesFilter initialSearch={search} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhuma categoria encontrada"
								: "Nenhuma categoria cadastrada"}
						</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar a busca para encontrar a categoria."
								: "Comece cadastrando categorias para classificar ferramentas."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/categories"
							>
								Limpar busca
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/categories/new"
								>
									Nova categoria
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<CategoriesTable canMutate={canMutate} categories={categories} />
			)}
		</div>
	);
}
