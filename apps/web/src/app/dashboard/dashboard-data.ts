import "server-only";
import { db } from "@emach/db";
import {
	getBranchOptions,
	getDailyRevenue,
	getDashboardSummary,
	getOrderFunnel,
	getReorderTable,
	getStockFlow,
	// (getDashboardKpis, getNewClients, getRatingDistribution,
	//  getToolStatusBreakdown, getPromotionStatusBreakdown removidos dos imports
	//  — não são mais usados na overview; ver Task 5)
} from "@emach/db/queries/dashboard";
import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";

export const fetchDashboardSummary = (
	branchId: string | null,
	period: DashboardPeriod
) => getDashboardSummary(db, branchId, period);
export const fetchReorderTable = (branchId: string | null) =>
	getReorderTable(db, branchId);
export const fetchBranchOptions = () => getBranchOptions(db);
export const fetchDailyRevenue = (
	branchId: string | null,
	period: DashboardPeriod
) => getDailyRevenue(db, branchId, period);
export const fetchOrderFunnel = (
	branchId: string | null,
	period: DashboardPeriod
) => getOrderFunnel(db, branchId, period);
export const fetchStockFlow = (
	branchId: string | null,
	period: DashboardPeriod
) => getStockFlow(db, branchId, period);
