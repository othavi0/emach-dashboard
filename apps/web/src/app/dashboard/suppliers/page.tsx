import { buttonVariants } from "@emach/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { SupplierCardGrid } from "./_components/supplier-card-grid";
import { SuppliersFilters } from "./_components/suppliers-filter";
import { fetchSuppliersTablePage, type SuppliersFiltersInput } from "./actions";

export const metadata: Metadata = {
	title: "Fornecedores",
};

interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
	}>;
}

export default function SuppliersPage({ searchParams }: PageProps) {
	return (
		<Suspense>
			<SuppliersPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function SuppliersPageContent({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("suppliers.read");
	const session = await requireCurrentSession();
	const canMutate = await can(session, "suppliers.manage");

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
