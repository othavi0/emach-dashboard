import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import type { ChartConfig } from "@emach/ui/components/chart";
import { Skeleton } from "@emach/ui/components/skeleton";
import { cn } from "@emach/ui/lib/utils";
import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { formatDateShort } from "@/lib/format/datetime";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { BranchFilter } from "./_components/branch-filter";
import {
	NewClientsLine,
	OrderFunnel,
	RatingBars,
	RevenueArea,
	StatusDonut,
	StockFlowArea,
} from "./_components/charts/lazy";
import { KpiRow } from "./_components/kpi-row";
import { ReorderTable } from "./_components/reorder-table";
import { parseBranchParam } from "./_lib/dashboard-params";
import { kpiGridClass, visibleKpiCount } from "./_lib/kpi-grid";
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
import { TOOL_STATUS_LABELS } from "./tools/_components/tool-schema";

export const metadata: Metadata = {
	title: "Visão geral",
};

// Deriva do mapa canônico de labels (tool-schema) — evita drift se um rótulo mudar.
const TOOL_STATUS_CONFIG = Object.fromEntries(
	Object.entries(TOOL_STATUS_LABELS).map(([status, label]) => [
		status,
		{ label },
	])
) satisfies ChartConfig;

const PROMO_STATUS_CONFIG = {
	ativa: { label: "Ativa" },
	agendada: { label: "Agendada" },
	expirada: { label: "Expirada" },
	inativa: { label: "Inativa" },
} satisfies ChartConfig;

export default function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[] }>;
}) {
	return <DashboardPageContent searchParams={searchParams} />;
}

async function DashboardPageContent({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[] }>;
}) {
	const session = await requireCurrentSession();
	const sp = await searchParams;
	const branchId = parseBranchParam(sp.branch);

	// Capabilities dos domínios restritos a Clientes/Reviews/Promoções (todos `SA`):
	// o `user` não os tem. KPIs/tabs/gráficos desses domínios só renderizam com
	// acesso — o gate de dado real vive nas server actions/queries (ADR-0016).
	const [canReadReviews, canReadCustomers, canReadPromotions] =
		await Promise.all([
			can(session, "reviews.read"),
			can(session, "customers.read"),
			can(session, "promotions.read"),
		]);
	const kpiCount = visibleKpiCount({
		canReadCustomers,
		canReadPromotions,
		canReadReviews,
	});

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<section className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Painel</p>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Olá, {session.user.name?.split(" ")[0] ?? "admin"}
					</h1>
				</div>
				<Suspense fallback={<Skeleton className="h-9 w-48" />}>
					<BranchFilterSlot value={branchId} />
				</Suspense>
			</section>

			<Suspense fallback={<KpiSkeleton count={kpiCount} />}>
				<KpiRow
					branchId={branchId}
					caps={{ canReadCustomers, canReadPromotions, canReadReviews }}
				/>
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<PendingSection
					canReadPromotions={canReadPromotions}
					canReadReviews={canReadReviews}
				/>
			</Suspense>

			<Suspense fallback={<Skeleton className="h-64 w-full" />}>
				<TrendsSection branchId={branchId} canReadReviews={canReadReviews} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-56 w-full" />}>
				<StrategicSection
					branchId={branchId}
					canReadCustomers={canReadCustomers}
					canReadPromotions={canReadPromotions}
				/>
			</Suspense>
		</main>
	);
}

async function BranchFilterSlot({ value }: { value: string | null }) {
	const options = await fetchBranchOptions();
	return <BranchFilter options={options} value={value} />;
}

function KpiSkeleton({ count }: { count: number }) {
	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(count))}>
			{Array.from({ length: count }, (_, i) => (
				<Skeleton className="h-24 w-full" key={`kpi-skeleton-${i}`} />
			))}
		</div>
	);
}

async function PendingSection({
	canReadReviews,
	canReadPromotions,
}: {
	canReadPromotions: boolean;
	canReadReviews: boolean;
}) {
	const [counts, stock, orders, activity, reviews, promos] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchDashboardActivity(null),
		canReadReviews ? fetchPendingReviews(null) : null,
		canReadPromotions ? fetchExpiringPromotions(null) : null,
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
	];
	if (canReadReviews && reviews) {
		tabs.push({
			id: "reviews",
			label: "Moderação",
			count: counts.reviews,
			role: "warning",
			initial: reviews.items,
			initialCursor: reviews.nextCursor,
			fetchPage: fetchPendingReviews,
		});
	}
	if (canReadPromotions && promos) {
		tabs.push({
			id: "promotions",
			label: "Promoções",
			count: counts.promotionsExpiring,
			role: "warning",
			initial: promos.items,
			initialCursor: promos.nextCursor,
			fetchPage: fetchExpiringPromotions,
		});
	}
	return (
		<section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<PendingPanel tabs={tabs} />
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

async function TrendsSection({
	branchId,
	canReadReviews,
}: {
	branchId: string | null;
	canReadReviews: boolean;
}) {
	const [revenue, funnel, ratings, reorder] = await Promise.all([
		fetchDailyRevenue(branchId),
		fetchOrderFunnel(branchId),
		canReadReviews ? fetchRatingDistribution() : null,
		fetchReorderTable(branchId),
	]);
	const revenueData = revenue.map((p) => ({
		day: formatDateShort(p.day),
		revenue: p.revenue,
		movingAvg: p.movingAvg,
	}));

	const funnelCard = (
		<Card>
			<CardHeader>
				<CardTitle>Funil de pedidos</CardTitle>
			</CardHeader>
			<CardContent>
				<OrderFunnel data={funnel} />
			</CardContent>
		</Card>
	);

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
			{canReadReviews && ratings ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{funnelCard}
					<Card>
						<CardHeader>
							<CardTitle>Distribuição de notas</CardTitle>
						</CardHeader>
						<CardContent>
							<RatingBars data={ratings} />
						</CardContent>
					</Card>
				</div>
			) : (
				funnelCard
			)}
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

// Classes completas por contagem de cards na fileira estratégica (purge-safe).
const STRATEGIC_GRID_BY_COUNT: Record<number, string> = {
	1: "",
	2: "lg:grid-cols-2",
	3: "lg:grid-cols-3",
};

async function StrategicSection({
	branchId,
	canReadCustomers,
	canReadPromotions,
}: {
	branchId: string | null;
	canReadCustomers: boolean;
	canReadPromotions: boolean;
}) {
	const [toolStatus, newClients, promoStatus, stockFlow] = await Promise.all([
		fetchToolStatus(),
		canReadCustomers ? fetchNewClients() : null,
		canReadPromotions ? fetchPromotionStatus() : null,
		fetchStockFlow(branchId),
	]);
	const flowData = stockFlow.map((p) => ({
		week: formatDateShort(p.week),
		entradas: p.entradas,
		saidas: p.saidas,
	}));

	const topCards: ReactNode[] = [
		<Card key="tools">
			<CardHeader>
				<CardTitle>Ferramentas por status</CardTitle>
			</CardHeader>
			<CardContent>
				<StatusDonut config={TOOL_STATUS_CONFIG} data={toolStatus} />
			</CardContent>
		</Card>,
	];
	if (canReadCustomers && newClients) {
		const clientsData = newClients.map((p) => ({
			week: formatDateShort(p.week),
			count: p.count,
		}));
		topCards.push(
			<Card key="clients">
				<CardHeader>
					<CardTitle>Novos clientes (90d)</CardTitle>
				</CardHeader>
				<CardContent>
					<NewClientsLine data={clientsData} />
				</CardContent>
			</Card>
		);
	}
	if (canReadPromotions && promoStatus) {
		topCards.push(
			<Card key="promotions">
				<CardHeader>
					<CardTitle>Status de promoções</CardTitle>
				</CardHeader>
				<CardContent>
					<StatusDonut config={PROMO_STATUS_CONFIG} data={promoStatus} />
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div
				className={cn(
					"grid gap-4",
					STRATEGIC_GRID_BY_COUNT[topCards.length] ?? "lg:grid-cols-3"
				)}
			>
				{topCards}
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
