import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { Skeleton } from "@emach/ui/components/skeleton";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { listCategoriesForTree } from "./actions";

const CategoriesTree = nextDynamic(
	() => import("./_components/categories-tree").then((m) => m.CategoriesTree),
	{ loading: () => <Skeleton className="h-64 w-full" /> }
);

export const metadata: Metadata = {
	title: "Categorias",
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
	const session = await requireCurrentSession();
	const [canMutate, canDelete] = await Promise.all([
		can(session, "categories.manage"),
		can(session, "categories.delete"),
	]);

	const categories = await listCategoriesForTree();
	const isEmpty = categories.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/categories/new"
						>
							<Plus aria-hidden className="size-4" />
							Nova categoria
						</Link>
					) : null
				}
				description="Hierarquia de categorias do catálogo. Arraste para reordenar categorias irmãs; clique numa categoria para ver os detalhes."
				title="Categorias"
			/>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma categoria cadastrada</EmptyTitle>
						<EmptyDescription>
							Cadastre as categorias raiz do catálogo. Você pode organizá-las em
							subcategorias depois.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{canMutate && (
							<Link
								className={buttonVariants({ variant: "default" })}
								href="/dashboard/categories/new"
							>
								Nova categoria
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<CategoriesTree
					canDelete={canDelete}
					canMutate={canMutate}
					categories={categories}
				/>
			)}
		</>
	);
}
