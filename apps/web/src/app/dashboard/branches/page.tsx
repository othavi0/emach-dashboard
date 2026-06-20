import { buttonVariants } from "@emach/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { BranchCardGrid } from "./_components/branch-card-grid";
import { BranchesFilters } from "./_components/branches-filters";
import { type BranchesFiltersInput, fetchBranchesTablePage } from "./actions";

export const metadata: Metadata = {
	title: "Filiais",
};

interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
	}>;
}

export default function BranchesPage({ searchParams }: PageProps) {
	return (
		<Suspense>
			<BranchesPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function BranchesPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("branches.read");
	const canManage = await can(session, "branches.manage");
	const sp = await searchParams;

	const filters: BranchesFiltersInput = {
		search: sp.search,
		sort: (sp.sort as BranchesFiltersInput["sort"]) ?? "newest",
	};

	const firstPage = await fetchBranchesTablePage({ filters, cursor: null });

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					canManage ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Criar filial
						</Link>
					) : undefined
				}
				description="Gerencie as filiais que recebem estoque e aparecem em ajustes de inventário."
				title="Filiais"
			/>

			<BranchesFilters />

			<BranchCardGrid
				canManage={canManage}
				filters={filters}
				initial={firstPage.items}
				initialCursor={firstPage.nextCursor}
				key={JSON.stringify(filters)}
			/>
		</div>
	);
}
