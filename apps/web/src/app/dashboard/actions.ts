"use server";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import type { InfiniteResult } from "@/lib/infinite";
import {
	type DashboardCounts,
	fetchDashboardActivity as fetchDashboardActivityImpl,
	fetchDashboardCounts as fetchDashboardCountsImpl,
	fetchExpiringPromotions as fetchExpiringPromotionsImpl,
	fetchPendingOrders as fetchPendingOrdersImpl,
	fetchPendingReviews as fetchPendingReviewsImpl,
	fetchPendingStock as fetchPendingStockImpl,
} from "./pending-data";

export async function fetchPendingStock(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingStockImpl(cursor);
}

export async function fetchPendingOrders(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingOrdersImpl(cursor);
}

export async function fetchPendingReviews(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingReviewsImpl(cursor);
}

export async function fetchDashboardActivity(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	return await fetchDashboardActivityImpl(cursor);
}

export async function fetchExpiringPromotions(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchExpiringPromotionsImpl(cursor);
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
	return await fetchDashboardCountsImpl();
}
