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
import { ExportCsvLink } from "./_components/export-csv-link";
import { OrderKpisRow } from "./_components/order-kpis";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrdersInfinite } from "./_components/orders-infinite";
import {
	fetchOrdersPage,
	getOrderKpis,
	getOrdersTabCounts,
	getRecentOrderActivity,
	listOrderBranches,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
import { ordersListFiltersSchema } from "./schema";
import { ORDER_STATUS_LABELS } from "./status-meta";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: PageProps) {
	const session = await requireCapability("orders.read");
	const canExport = can(session.user.role as UserRole, "orders.export");
	const raw = await searchParams;
	const parsed = ordersListFiltersSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : ordersListFiltersSchema.parse({});

	const filters: OrderListFilters = {
		tab: data.tab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		page: data.page,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: data.tab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
	};

	const [branches, counts, kpis, recentActivity, result] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		getOrderKpis(),
		getRecentOrderActivity(),
		fetchOrdersPage({ filters: pageFilters, cursor: null }),
	]);

	const hasFilters = Boolean(
		filters.tab || filters.q || filters.from || filters.to || filters.branchId
	);

	const pendingGroups: PendingGroup[] = [
		{
			title: "Aguardando ação",
			items: [
				{
					label: "Pagos · iniciar preparação",
					count: counts.paid ?? 0,
					href: "/dashboard/orders?tab=paid",
					role: "warning",
				},
				{
					label: "Pagamento pendente",
					count: counts.pending_payment ?? 0,
					href: "/dashboard/orders?tab=pending_payment",
					role: "info",
				},
			],
		},
		{
			title: "Em fluxo",
			items: [
				{
					label: "Em preparação",
					count: counts.preparing ?? 0,
					href: "/dashboard/orders?tab=preparing",
					role: "info",
				},
				{
					label: "Em transporte",
					count: counts.shipped ?? 0,
					href: "/dashboard/orders?tab=shipped",
					role: "info",
				},
			],
		},
	];

	const activityEvents: ActivityEvent[] = recentActivity.map((row) => ({
		id: row.id,
		kind: "order" as const,
		at: row.createdAt,
		primary: `#${row.orderNumber} → ${ORDER_STATUS_LABELS[row.toStatus]}`,
		href: `/dashboard/orders/${row.orderId}`,
	}));

	return (
		<>
			<PageHeader
				action={canExport ? <ExportCsvLink filters={filters} /> : null}
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

			<OrderKpisRow kpis={kpis} />

			<section className="grid gap-3 lg:grid-cols-2">
				<PendingList
					emptyMessage="Nenhum pedido aguardando ação."
					groups={pendingGroups}
					title="Pendências de pedidos"
				/>
				<ActivityFeed
					emptyMessage="Sem mudanças de status recentes."
					events={activityEvents}
					title="Histórico recente"
				/>
			</section>

			<OrderFiltersPanel
				branches={branches}
				counts={counts}
				filters={filters}
			/>

			{result.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
								: "Os pedidos aparecerão aqui conforme forem criados no site ecomerce."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters && (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/orders"
							>
								Limpar filtros
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<OrdersInfinite
					filters={pageFilters}
					initial={result.items}
					initialCursor={result.nextCursor}
					tableFilters={filters}
				/>
			)}
		</>
	);
}
