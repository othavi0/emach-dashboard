import { Skeleton } from "@emach/ui/components/skeleton";
import { Suspense } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCurrentSession } from "@/lib/session";
import { BranchFilter } from "./_components/branch-filter";
import { KpiRow } from "./_components/kpi-row";
import { parseBranchParam } from "./_lib/dashboard-params";
import {
	fetchDashboardActivity,
	fetchDashboardCounts,
	fetchExpiringPromotions,
	fetchPendingOrders,
	fetchPendingReviews,
	fetchPendingStock,
} from "./actions";
import { fetchBranchOptions } from "./dashboard-data";

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
