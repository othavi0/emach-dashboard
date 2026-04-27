import type { UserRole } from "@emach/db/schema/auth";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	CategoriesTable,
	type CategoryRow,
} from "./_components/categories-table";
import { listCategories } from "./actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
	const session = await requireCurrentSession();
	const role = session.user.role as UserRole | undefined;
	const canMutate = can(role, "categories.manage");

	const rows = await listCategories();
	const categories: CategoryRow[] = rows.map((c) => ({
		id: c.id,
		name: c.name,
		slug: c.slug,
		path: c.path,
		depth: c.depth,
		isActive: c.isActive,
	}));

	const isEmpty = categories.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Categorias</h1>
					<p className="text-muted-foreground text-sm">
						Hierarquia de categorias usada para classificar ferramentas no
						catálogo. Subcategorias herdam o caminho do pai.
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
				<CategoriesTable canMutate={canMutate} categories={categories} />
			)}
		</div>
	);
}
