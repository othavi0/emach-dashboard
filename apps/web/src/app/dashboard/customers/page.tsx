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

import { ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { can, requireCapability } from "@/lib/permissions";
import { CustomerFilters } from "./_components/customer-filters";
import { CustomersInfinite } from "./_components/customers-infinite";
import { ExportCsvLink } from "./_components/export-csv-link";
import {
	fetchCustomerActivityPage,
	fetchPendingBlockedCustomersPage,
	fetchPendingCustomersPage,
	fetchPendingInactiveOrderCustomersPage,
	fetchPendingNoDocumentCustomersPage,
	fetchPendingUnverifiedCustomersPage,
} from "./actions";
import { getCustomerPendingCounts, listCustomers } from "./data";
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

	const [
		counts,
		pendingBlocked,
		pendingNoDoc,
		pendingInactive,
		pendingUnverified,
		activity,
		result,
	] = await Promise.all([
		getCustomerPendingCounts(),
		fetchPendingCustomersPage({ kind: "blocked", cursor: null }),
		fetchPendingCustomersPage({ kind: "no_doc", cursor: null }),
		fetchPendingCustomersPage({ kind: "inactive_open_order", cursor: null }),
		fetchPendingCustomersPage({ kind: "unverified_new", cursor: null }),
		fetchCustomerActivityPage(null),
		listCustomers({ filters, cursor: null }),
	]);

	const hasFilters = Boolean(
		filters.q ||
			filters.status ||
			filters.clientType?.length ||
			filters.createdFrom ||
			filters.createdTo ||
			filters.lastOrderFrom ||
			filters.lastOrderTo ||
			filters.ltvMin !== undefined ||
			filters.ltvMax !== undefined ||
			filters.missingDoc ||
			filters.openOrderInactive ||
			filters.unverifiedNew
	);

	const pendingTabs: PendingTab[] = [
		{
			id: "blocked",
			label: "Bloqueados",
			count: counts.blocked,
			role: "warning",
			initial: pendingBlocked.items,
			initialCursor: pendingBlocked.nextCursor,
			fetchPage: fetchPendingBlockedCustomersPage,
		},
		{
			id: "no_doc",
			label: "Sem documento",
			count: counts.noDoc,
			role: "warning",
			initial: pendingNoDoc.items,
			initialCursor: pendingNoDoc.nextCursor,
			fetchPage: fetchPendingNoDocumentCustomersPage,
		},
		{
			id: "inactive_open_order",
			label: "Inativos c/ pedido",
			count: counts.inactiveWithOpenOrder,
			role: "info",
			initial: pendingInactive.items,
			initialCursor: pendingInactive.nextCursor,
			fetchPage: fetchPendingInactiveOrderCustomersPage,
		},
		{
			id: "unverified_new",
			label: "Novos s/ verificação",
			count: counts.unverifiedNew,
			role: "info",
			initial: pendingUnverified.items,
			initialCursor: pendingUnverified.nextCursor,
			fetchPage: fetchPendingUnverifiedCustomersPage,
		},
	];

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

			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<PendingPanel
					compact
					emptyMessage="Nenhum cliente aguardando ação."
					tabs={pendingTabs}
					title="Atenção em clientes"
				/>
				<div className="relative min-h-[18rem] min-w-0">
					<div className="absolute inset-0">
						<ActivityFeed
							emptyMessage="Sem atividade recente."
							fetchPage={fetchCustomerActivityPage}
							initialCursor={activity.nextCursor}
							initialEvents={activity.items}
							title="Atividade recente"
						/>
					</div>
				</div>
			</section>

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
