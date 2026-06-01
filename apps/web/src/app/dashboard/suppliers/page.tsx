import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { SupplierCardGrid } from "./_components/supplier-card-grid";
import { SuppliersFilters } from "./_components/suppliers-filter";
import { fetchSuppliersTablePage, type SuppliersFiltersInput } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
	}>;
}

export default async function SuppliersPage({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("suppliers.read");
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate =
		role === "admin" || role === "super_admin" || role === "manager";

	const sp = await searchParams;

	const filters: SuppliersFiltersInput = {
		search: sp.search,
		sort: sp.sort === "name" ? "name" : "newest",
	};

	const first = await fetchSuppliersTablePage({ filters, cursor: null });

	return (
		<div className="flex flex-col gap-6">
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

			<SuppliersFilters />

			<SupplierCardGrid
				filters={filters}
				initial={first.items}
				initialCursor={first.nextCursor}
				key={JSON.stringify(filters)}
			/>
		</div>
	);
}
