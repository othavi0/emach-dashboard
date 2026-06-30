import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Skeleton } from "@emach/ui/components/skeleton";
import { cn } from "@emach/ui/lib/utils";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { formatDateShort } from "@/lib/format/datetime";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { BranchFilter } from "./_components/branch-filter";
import {
	OrderFunnel,
	RevenueArea,
	StockFlowArea,
} from "./_components/charts/lazy";
import { KpiRow } from "./_components/kpi-row";
import { PeriodFilter } from "./_components/period-filter";
import { ReorderTable } from "./_components/reorder-table";
import { parseBranchParam, parsePeriodParam } from "./_lib/dashboard-params";
import { kpiGridClass } from "./_lib/kpi-grid";
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
	fetchOrderFunnel,
	fetchReorderTable,
	fetchStockFlow,
} from "./dashboard-data";

export const metadata: Metadata = {
	title: "Visão geral",
};

export default function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{
		branch?: string | string[];
		period?: string | string[];
	}>;
}) {
	return <DashboardPageContent searchParams={searchParams} />;
}

async function DashboardPageContent({
	searchParams,
}: {
	searchParams: Promise<{
		branch?: string | string[];
		period?: string | string[];
	}>;
}) {
	const session = await requireCurrentSession();
	const sp = await searchParams;
	const branchId = parseBranchParam(sp.branch);
	const period = parsePeriodParam(sp.period);

	const [canReadReviews, canReadPromotions] = await Promise.all([
		can(session, "reviews.read"),
		can(session, "promotions.read"),
	]);

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<section className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Painel</p>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Olá, {session.user.name?.split(" ")[0] ?? "admin"}
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<PeriodFilter value={period} />
					<Suspense fallback={<Skeleton className="h-9 w-48" />}>
						<BranchFilterSlot value={branchId} />
					</Suspense>
				</div>
			</section>

			<Suspense fallback={<KpiSkeleton />}>
				<KpiRow branchId={branchId} period={period} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<PendingSection
					canReadPromotions={canReadPromotions}
					canReadReviews={canReadReviews}
				/>
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<SalesOrdersSection branchId={branchId} period={period} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-64 w-full" />}>
				<StockSection branchId={branchId} period={period} />
			</Suspense>
		</main>
	);
}

async function BranchFilterSlot({ value }: { value: string | null }) {
	const options = await fetchBranchOptions();
	return <BranchFilter options={options} value={value} />;
}

function KpiSkeleton() {
	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			{Array.from({ length: 4 }, (_, i) => (
				// lista estática de 4 placeholders sem id próprio — índice é estável
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

// Layout C: Receita grande (2fr) + Funil empilhado (1fr).
async function SalesOrdersSection({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const [revenue, funnel] = await Promise.all([
		fetchDailyRevenue(branchId, period),
		fetchOrderFunnel(branchId, period),
	]);
	const revenueData = revenue.map((p) => ({
		day: formatDateShort(p.day),
		revenue: p.revenue,
		movingAvg: p.movingAvg,
	}));
	return (
		<section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
			<Card>
				<CardHeader>
					<CardTitle>Receita</CardTitle>
				</CardHeader>
				<CardContent>
					<RevenueArea data={revenueData} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Funil de pedidos</CardTitle>
				</CardHeader>
				<CardContent>
					<OrderFunnel data={funnel} />
				</CardContent>
			</Card>
		</section>
	);
}

// Estoque: Fluxo + Reposição lado a lado, em section band (ritmo vertical).
async function StockSection({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const [stockFlow, reorder] = await Promise.all([
		fetchStockFlow(branchId, period),
		fetchReorderTable(branchId),
	]);
	const flowData = stockFlow.map((p) => ({
		week: formatDateShort(p.week),
		entradas: p.entradas,
		saidas: p.saidas,
	}));
	return (
		<section className="-mx-6 grid gap-4 border-border border-y bg-muted/50 px-6 py-10 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Entradas × Saídas de estoque</CardTitle>
				</CardHeader>
				<CardContent>
					<StockFlowArea data={flowData} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Itens para repor</CardTitle>
				</CardHeader>
				<CardContent>
					<ReorderTable rows={reorder} />
				</CardContent>
			</Card>
		</section>
	);
}
