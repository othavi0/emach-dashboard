import { buttonVariants } from "@emach/ui/components/button";
import { Building2, PackageX, ShoppingCart, Warehouse } from "lucide-react";
import Link from "next/link";

import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { BranchCardGrid } from "./_components/branch-card-grid";
import { BranchesFilters } from "./_components/branches-filters";
import { type BranchesFiltersInput, fetchBranchesTablePage } from "./actions";
import { getBranchKpis } from "./data";

export const dynamic = "force-dynamic";

interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
	}>;
}

export default async function BranchesPage({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("branches.read");
	const canManage = can(session.user.role, "branches.manage");
	const sp = await searchParams;

	const filters: BranchesFiltersInput = {
		search: sp.search,
		sort: (sp.sort as BranchesFiltersInput["sort"]) ?? "newest",
	};

	const [kpis, firstPage] = await Promise.all([
		getBranchKpis(),
		fetchBranchesTablePage({ filters, cursor: null }),
	]);

	const stockValueFormatted = new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(kpis.stockValue);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					canManage ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Nova filial
						</Link>
					) : undefined
				}
				description="Gerencie as filiais que recebem estoque e aparecem em ajustes de inventário."
				title="Filiais"
			/>

			<EntityKpisRow
				items={[
					{
						label: "Filiais",
						value: kpis.total,
						icon: Building2,
					},
					{
						label: "Pedidos em aberto",
						value: kpis.openOrders,
						tone: kpis.openOrders > 0 ? "warning" : "default",
						icon: ShoppingCart,
					},
					{
						label: "SKUs abaixo do mín.",
						value: kpis.lowStockCount,
						tone: kpis.lowStockCount > 0 ? "danger" : "default",
						icon: PackageX,
						href: kpis.lowStockCount > 0 ? "/dashboard/stock" : undefined,
					},
					{
						label: "Valor em estoque",
						value: stockValueFormatted,
						icon: Warehouse,
					},
				]}
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
