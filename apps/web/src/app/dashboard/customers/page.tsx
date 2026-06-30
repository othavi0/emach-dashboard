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
import { CustomersInfinite } from "./_components/customers-infinite";
import { ExportCsvLink } from "./_components/export-csv-link";
import { listCustomers } from "./data";
import { customersListFiltersSchema } from "./schema";

export const metadata: Metadata = {
	title: "Clientes",
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
	const filters = parsed.success
		? parsed.data
		: customersListFiltersSchema.parse({});

	const result = await listCustomers({ filters, cursor: null });

	const hasFilters = Boolean(
		filters.q ||
			filters.status ||
			filters.clientType?.length ||
			filters.missingDoc ||
			filters.openOrderInactive ||
			filters.unverifiedNew
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
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum cliente encontrado</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
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
			) : (
				<CustomersInfinite
					filters={filters}
					initial={result.items}
					initialCursor={result.nextCursor}
				/>
			)}
		</>
	);
}
