import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { SuppliersFilter } from "./_components/suppliers-filter";
import { SuppliersTable } from "./_components/suppliers-table";
import { listSuppliers } from "./actions";

interface PageProps {
	searchParams: Promise<{
		search?: string;
	}>;
}

export const dynamic = "force-dynamic";

export default async function SuppliersPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const params = await searchParams;
	const search = params.search ?? "";
	const suppliers = await listSuppliers({ search: search || undefined });
	const hasFilters = Boolean(search);
	const isEmpty = suppliers.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/suppliers/new"
						>
							Novo fornecedor
						</Link>
					) : null
				}
				description="Gerencie contatos comerciais usados no cadastro de ferramentas."
				title="Fornecedores"
			/>

			<SuppliersFilter initialSearch={search} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhum fornecedor encontrado"
								: "Nenhum fornecedor cadastrado"}
						</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar a busca para encontrar o fornecedor."
								: "Comece cadastrando fornecedores para associá-los às ferramentas."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/suppliers"
							>
								Limpar busca
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/suppliers/new"
								>
									Novo fornecedor
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<SuppliersTable canMutate={canMutate} suppliers={suppliers} />
			)}
		</>
	);
}
