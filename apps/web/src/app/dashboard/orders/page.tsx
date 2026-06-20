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
import { ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCapability } from "@/lib/permissions";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrdersInfinite } from "./_components/orders-infinite";
import {
	fetchOrderActivityPage,
	fetchPendingAwaitingOrdersPage,
	fetchPendingFlowOrdersPage,
	fetchPendingOrdersPage,
} from "./actions";
import {
	fetchOrdersPage,
	getOrdersTabCounts,
	listOrderBranches,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
import { ordersListFiltersSchema } from "./schema";
import { DEFAULT_ORDER_TAB } from "./status-meta";

export const metadata: Metadata = {
	title: "Pedidos",
};

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function OrdersPage({ searchParams }: PageProps) {
	return <OrdersPageContent searchParams={searchParams} />;
}

async function OrdersPageContent({ searchParams }: PageProps) {
	await requireCapability("orders.read");
	const raw = await searchParams;
	const parsed = ordersListFiltersSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : ordersListFiltersSchema.parse({});

	// Sem ?tab na URL → abre na fila acionável ("A preparar"), não em todos.
	const activeTab = data.tab ?? DEFAULT_ORDER_TAB;
	const unverifiedShipping = data.unverified === "1";

	const filters: OrderListFilters = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		page: data.page,
		unverifiedShipping,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		unverifiedShipping,
	};

	const [branches, counts, pendingAwaiting, pendingFlow, activity, result] =
		await Promise.all([
			listOrderBranches(),
			getOrdersTabCounts(),
			fetchPendingOrdersPage({
				statuses: ["paid", "pending_payment"],
				cursor: null,
			}),
			fetchPendingOrdersPage({
				statuses: ["preparing", "shipped"],
				cursor: null,
			}),
			fetchOrderActivityPage(null),
			fetchOrdersPage({ filters: pageFilters, cursor: null }),
		]);

	// O tab default ("A preparar") não conta como filtro ativo — só desvios dele.
	const hasFilters = Boolean(
		filters.q ||
			filters.from ||
			filters.to ||
			filters.branchId ||
			unverifiedShipping ||
			activeTab !== DEFAULT_ORDER_TAB
	);

	const awaitingCount = (counts.paid ?? 0) + (counts.pending_payment ?? 0);
	const flowCount = (counts.preparing ?? 0) + (counts.shipped ?? 0);

	const pendingTabs: PendingTab[] = [
		{
			id: "awaiting",
			label: "Aguardando ação",
			count: awaitingCount,
			role: "warning",
			initial: pendingAwaiting.items,
			initialCursor: pendingAwaiting.nextCursor,
			fetchPage: fetchPendingAwaitingOrdersPage,
		},
		{
			id: "flow",
			label: "Em fluxo",
			count: flowCount,
			role: "info",
			initial: pendingFlow.items,
			initialCursor: pendingFlow.nextCursor,
			fetchPage: fetchPendingFlowOrdersPage,
		},
	];

	return (
		<>
			<PageHeader
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<PendingPanel
					emptyMessage="Nenhum pedido aguardando ação."
					tabs={pendingTabs}
					title="Pendências de pedidos"
				/>
				<div className="relative min-h-[18rem] min-w-0">
					<div className="absolute inset-0">
						<ActivityFeed
							emptyMessage="Sem mudanças de status recentes."
							fetchPage={fetchOrderActivityPage}
							initialCursor={activity.nextCursor}
							initialEvents={activity.items}
							title="Histórico recente"
						/>
					</div>
				</div>
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
								: "Nenhum pedido aguardando preparação. Use a aba “Todos” para ver o histórico completo."}
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
				/>
			)}
		</>
	);
}
