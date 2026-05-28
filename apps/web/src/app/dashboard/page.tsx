import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import type { ChartConfig } from "@emach/ui/components/chart";
import { Skeleton } from "@emach/ui/components/skeleton";
import { format } from "date-fns";
import { Suspense } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCurrentSession } from "@/lib/session";
import { BranchFilter } from "./_components/branch-filter";
import { NewClientsLine } from "./_components/charts/new-clients-line";
import { OrderFunnel } from "./_components/charts/order-funnel";
import { RatingBars } from "./_components/charts/rating-bars";
import { RevenueArea } from "./_components/charts/revenue-area";
import { StatusDonut } from "./_components/charts/status-donut";
import { StockFlowArea } from "./_components/charts/stock-flow-area";
import { KpiRow } from "./_components/kpi-row";
import { ReorderTable } from "./_components/reorder-table";
import { parseBranchParam } from "./_lib/dashboard-params";
import {
	fetchDashboardActivity,
	fetchDashboardCounts,
	fetchExpiringPromotions,
	fetchPendingOrders,
	fetchPendingReviews,
	fetchPendingStock,
} from "./actions";
import {
	fetchBranchOptions,
	fetchDailyRevenue,
	fetchNewClients,
	fetchOrderFunnel,
	fetchPromotionStatus,
	fetchRatingDistribution,
	fetchReorderTable,
	fetchStockFlow,
	fetchToolStatus,
} from "./dashboard-data";

const TOOL_STATUS_CONFIG = {
	draft: { label: "Rascunho" },
	active: { label: "Ativo" },
	out_of_stock: { label: "Sem estoque" },
	discontinued: { label: "Descontinuado" },
} satisfies ChartConfig;

const PROMO_STATUS_CONFIG = {
	ativa: { label: "Ativa" },
	agendada: { label: "Agendada" },
	expirada: { label: "Expirada" },
	inativa: { label: "Inativa" },
} satisfies ChartConfig;

export default async function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[] }>;
}) {
	const session = await requireCurrentSession();
	const sp = await searchParams;
	const branchId = parseBranchParam(sp.branch);
	const branchOptions = await fetchBranchOptions();

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<section className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Painel</p>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Olá, {session.user.name?.split(" ")[0] ?? "admin"}
					</h1>
				</div>
				<BranchFilter options={branchOptions} value={branchId} />
			</section>

			<Suspense fallback={<KpiSkeleton />}>
				<KpiRow branchId={branchId} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<PendingSection />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-64 w-full" />}>
				<TrendsSection branchId={branchId} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-56 w-full" />}>
				<StrategicSection branchId={branchId} />
			</Suspense>
		</main>
	);
}

function KpiSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{Array.from({ length: 6 }, (_, i) => (
				<Skeleton className="h-24 w-full" key={`kpi-skeleton-${i}`} />
			))}
		</div>
	);
}

async function PendingSection() {
	const [counts, stock, orders, reviews, promos, activity] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchPendingReviews(null),
		fetchExpiringPromotions(null),
		fetchDashboardActivity(null),
	]);
	const tabs: PendingTab[] = [
		{
			id: "stock",
			label: "Estoque",
			count: counts.stock,
			role: "warning",
			initial: stock.items,
			initialCursor: stock.nextCursor,
			fetchPage: fetchPendingStock,
		},
		{
			id: "orders",
			label: "Pedidos",
			count: counts.orders,
			role: "info",
			initial: orders.items,
			initialCursor: orders.nextCursor,
			fetchPage: fetchPendingOrders,
		},
		{
			id: "reviews",
			label: "Moderação",
			count: counts.reviews,
			role: "warning",
			initial: reviews.items,
			initialCursor: reviews.nextCursor,
			fetchPage: fetchPendingReviews,
		},
		{
			id: "promotions",
			label: "Promoções",
			count: counts.promotionsExpiring,
			role: "warning",
			initial: promos.items,
			initialCursor: promos.nextCursor,
			fetchPage: fetchExpiringPromotions,
		},
	];
	return (
		<section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<PendingPanel compact tabs={tabs} />
			<div className="relative min-h-[18rem] min-w-0">
				<div className="absolute inset-0">
					<ActivityFeed
						fetchPage={fetchDashboardActivity}
						initialCursor={activity.nextCursor}
						initialEvents={activity.items}
					/>
				</div>
			</div>
		</section>
	);
}

async function TrendsSection({ branchId }: { branchId: string | null }) {
	const [revenue, funnel, ratings, reorder] = await Promise.all([
		fetchDailyRevenue(branchId),
		fetchOrderFunnel(branchId),
		fetchRatingDistribution(),
		fetchReorderTable(branchId),
	]);
	const revenueData = revenue.map((p) => ({
		day: format(p.day, "dd/MM"),
		revenue: p.revenue,
		movingAvg: p.movingAvg,
	}));

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Receita diária (30d)</CardTitle>
				</CardHeader>
				<CardContent>
					<RevenueArea data={revenueData} />
				</CardContent>
			</Card>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Funil de pedidos</CardTitle>
					</CardHeader>
					<CardContent>
						<OrderFunnel data={funnel} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Distribuição de notas</CardTitle>
					</CardHeader>
					<CardContent>
						<RatingBars data={ratings} />
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Itens para repor</CardTitle>
				</CardHeader>
				<CardContent>
					<ReorderTable rows={reorder} />
				</CardContent>
			</Card>
		</div>
	);
}

async function StrategicSection({ branchId }: { branchId: string | null }) {
	const [toolStatus, newClients, promoStatus, stockFlow] = await Promise.all([
		fetchToolStatus(),
		fetchNewClients(),
		fetchPromotionStatus(),
		fetchStockFlow(branchId),
	]);
	const clientsData = newClients.map((p) => ({
		week: format(p.week, "dd/MM"),
		count: p.count,
	}));
	const flowData = stockFlow.map((p) => ({
		week: format(p.week, "dd/MM"),
		entradas: p.entradas,
		saidas: p.saidas,
	}));

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Ferramentas por status</CardTitle>
					</CardHeader>
					<CardContent>
						<StatusDonut config={TOOL_STATUS_CONFIG} data={toolStatus} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Novos clientes (90d)</CardTitle>
					</CardHeader>
					<CardContent>
						<NewClientsLine data={clientsData} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Status de promoções</CardTitle>
					</CardHeader>
					<CardContent>
						<StatusDonut config={PROMO_STATUS_CONFIG} data={promoStatus} />
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Entradas × Saídas de estoque (12 sem)</CardTitle>
				</CardHeader>
				<CardContent>
					<StockFlowArea data={flowData} />
				</CardContent>
			</Card>
		</div>
	);
}
