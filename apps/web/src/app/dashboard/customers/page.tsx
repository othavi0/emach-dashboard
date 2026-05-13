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

import { type ActivityEvent, ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";
import { type PendingGroup, PendingList } from "@/components/pending-list";
import { can, requireCapability } from "@/lib/permissions";
import { CustomerFilters } from "./_components/customer-filters";
import { CustomersInfinite } from "./_components/customers-infinite";
import { ExportCsvLink } from "./_components/export-csv-link";
import {
	getCustomerPendingCounts,
	getRecentCustomerActivity,
	listCustomers,
} from "./data";
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

	const [counts, recentActivity, result] = await Promise.all([
		getCustomerPendingCounts(),
		getRecentCustomerActivity(),
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

	const pendingGroups: PendingGroup[] = [
		{
			title: "Aguardando ação",
			items: [
				{
					label: "Bloqueados",
					count: counts.blocked,
					href: "/dashboard/customers?status=blocked",
					role: "warning",
				},
				{
					label: "Sem documento (CPF/CNPJ)",
					count: counts.noDoc,
					href: "/dashboard/customers?missingDoc=1",
					role: "warning",
				},
			],
		},
		{
			title: "Pendências",
			items: [
				{
					label: "Inativos c/ pedido em aberto",
					count: counts.inactiveWithOpenOrder,
					href: "/dashboard/customers?openOrderInactive=1",
					role: "info",
				},
				{
					label: "Novos sem email verificado",
					count: counts.unverifiedNew,
					href: "/dashboard/customers?unverifiedNew=1",
					role: "info",
				},
			],
		},
	];

	const ACTIVITY_LABELS: Record<
		"new_client" | "login" | "first_order",
		string
	> = {
		new_client: "Novo cadastro",
		login: "Login",
		first_order: "1ª compra",
	};

	const activityEvents: ActivityEvent[] = recentActivity.map((row) => ({
		id: row.id,
		kind: "customer" as const,
		at: row.at,
		primary: `${ACTIVITY_LABELS[row.kind]} · ${row.clientName}`,
		href: `/dashboard/customers/${row.clientId}`,
	}));

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

			<section className="grid gap-3 lg:grid-cols-2">
				<PendingList
					emptyMessage="Nenhum cliente aguardando ação."
					groups={pendingGroups}
					title="Atenção em clientes"
				/>
				<ActivityFeed
					emptyMessage="Sem atividade recente."
					events={activityEvents}
					title="Atividade recente"
				/>
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
