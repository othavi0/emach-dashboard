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

import { PageHeader } from "@/components/page-header";
import { can, requireCapability } from "@/lib/permissions";
import { CustomerFilters } from "./_components/customer-filters";
import { CustomersInfinite } from "./_components/customers-infinite";
import { ExportCsvLink } from "./_components/export-csv-link";
import { listCustomers } from "./data";
import { customersListFiltersSchema } from "./schema";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: PageProps) {
	const session = await requireCapability("customers.read");
	const role = (session.user.role ?? "user") as UserRole;

	const canExport = can(role, "customers.export");

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
			filters.createdFrom ||
			filters.createdTo ||
			filters.lastOrderFrom ||
			filters.lastOrderTo ||
			filters.ltvMin !== undefined ||
			filters.ltvMax !== undefined
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

			<CustomerFilters filters={filters} />

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
