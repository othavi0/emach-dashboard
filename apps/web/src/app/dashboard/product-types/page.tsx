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
import { ProductTypesFilter } from "./_components/product-types-filter";
import { ProductTypesTable } from "./_components/product-types-table";
import { listProductTypes } from "./actions";

interface PageProps {
	searchParams: Promise<{
		search?: string;
	}>;
}

export const dynamic = "force-dynamic";

export default async function ProductTypesPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const params = await searchParams;
	const search = params.search ?? "";
	const productTypes = await listProductTypes({
		search: search || undefined,
	});
	const hasFilters = Boolean(search);
	const isEmpty = productTypes.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Tipos de produto</h1>
					<p className="text-muted-foreground text-sm">
						Organize o catálogo de ferramentas por tipo de produto.
					</p>
				</div>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/product-types/new"
					>
						Novo tipo
					</Link>
				)}
			</div>

			<ProductTypesFilter initialSearch={search} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhum tipo encontrado"
								: "Nenhum tipo cadastrado"}
						</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar a busca para encontrar o tipo."
								: "Comece cadastrando tipos para classificar ferramentas."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/product-types"
							>
								Limpar busca
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/product-types/new"
								>
									Novo tipo
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<ProductTypesTable canMutate={canMutate} productTypes={productTypes} />
			)}
		</div>
	);
}
