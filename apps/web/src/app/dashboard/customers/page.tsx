import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { CustomerFilters } from "./_components/customer-filters";
import { CustomerStatusTabs } from "./_components/customer-status-tabs";
import { CustomersInfinite } from "./_components/customers-infinite";
import { ExportCsvLink } from "./_components/export-csv-link";
import { countCustomersByStatus, listCustomers } from "./data";
import { customersListFiltersSchema } from "./schema";

export const metadata: Metadata = {
	title: "Clientes",
};

const EMPTY_TITLES: Record<string, string> = {
	active: "Nenhum cliente ativo",
	inactive_blocked: "Nenhum cliente inativo ou bloqueado",
};

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function CustomersPage({ searchParams }: PageProps) {
	return <CustomersPageContent searchParams={searchParams} />;
}

async function CustomersPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect(
		"customers.read",
		"/dashboard/sem-acesso?recurso=Clientes"
	);

	const canExport = await can(session, "customers.export");

	const raw = await searchParams;
	const parsed = customersListFiltersSchema.safeParse(raw);
	const parsedFilters = parsed.success
		? parsed.data
		: customersListFiltersSchema.parse({});

	// Tab "Ativos" é o default da listagem. Quick-filters de triagem (pending
	// panel) não herdam o default: openOrderInactive mira clientes inativos e
	// sumiria com status=active implícito.
	const hasQuickFilter = Boolean(
		parsedFilters.missingDoc ||
			parsedFilters.openOrderInactive ||
			parsedFilters.unverifiedNew
	);
	const filters =
		parsedFilters.status || hasQuickFilter
			? parsedFilters
			: { ...parsedFilters, status: "active" as const };

	const [result, statusCounts] = await Promise.all([
		listCustomers({ filters, cursor: null }),
		countCustomersByStatus(filters),
	]);

	const hasFilters = Boolean(
		parsedFilters.q ||
			parsedFilters.status ||
			parsedFilters.clientType?.length ||
			hasQuickFilter
	);

	return (
		<>
			<PageHeader
				action={
					<div className="flex items-center gap-2">
						{canExport && <ExportCsvLink filters={filters} />}
					</div>
				}
				description="Base de clientes do site ecomerce. Edição limitada (LGPD), auditoria e exports."
				title="Clientes"
			/>

			<CustomerFilters />

			{result.items.length === 0 ? (
				<>
					<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
						<CustomerStatusTabs counts={statusCounts} />
					</div>
					<Empty>
						<EmptyHeader>
							<EmptyTitle>
								{EMPTY_TITLES[filters.status ?? ""] ??
									"Nenhum cliente encontrado"}
							</EmptyTitle>
							<EmptyDescription>
								{hasFilters
									? "Ajuste os filtros ou troque de tab para ampliar a busca."
									: "Os clientes aparecerão aqui conforme se cadastrarem no site ecomerce."}
							</EmptyDescription>
						</EmptyHeader>
						{hasFilters && (
							<EmptyContent>
								<Link
									className={buttonVariants({ variant: "ghost" })}
									href="/dashboard/customers"
								>
									Limpar filtros
								</Link>
							</EmptyContent>
						)}
					</Empty>
				</>
			) : (
				<CustomersInfinite
					counts={statusCounts}
					filters={filters}
					initial={result.items}
					initialCursor={result.nextCursor}
				/>
			)}
		</>
	);
}
