import { buttonVariants } from "@emach/ui/components/button";
import { AlertCircle, CheckCircle2, Factory, Plus } from "lucide-react";
import Link from "next/link";

import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { SuppliersFilters } from "./_components/suppliers-filter";
import { SuppliersTable } from "./_components/suppliers-table";
import { fetchSuppliersTablePage, type SuppliersFiltersInput } from "./actions";
import { getSupplierKpis } from "./data";

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

	const [kpis, first] = await Promise.all([
		getSupplierKpis(),
		fetchSuppliersTablePage({ filters, cursor: null }),
	]);

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

			<EntityKpisRow
				items={[
					{
						label: "Total",
						value: kpis.total,
						icon: Factory,
					},
					{
						label: "Com ferramentas ativas",
						value: kpis.withActive,
						icon: CheckCircle2,
					},
					{
						label: "Sem ferramentas",
						value: kpis.empty,
						tone: kpis.empty > 0 ? "warning" : "default",
						icon: AlertCircle,
					},
					{
						label: "Adicionados em 30 dias",
						value: kpis.recent30d,
						icon: Plus,
					},
				]}
			/>

			<SuppliersFilters />

			<SuppliersTable
				canMutate={canMutate}
				filters={filters}
				initial={first.items}
				initialCursor={first.nextCursor}
				key={JSON.stringify(filters)}
			/>
		</div>
	);
}
