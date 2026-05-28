import "server-only";
import { db } from "@emach/db";
import {
	getBranchOptions,
	getDailyRevenue,
	getDashboardKpis,
	getNewClients,
	getOrderFunnel,
	getPromotionStatusBreakdown,
	getRatingDistribution,
	getReorderTable,
	getStockFlow,
	getToolStatusBreakdown,
} from "@emach/db/queries/dashboard";

export const fetchKpis = (branchId: string | null) =>
	getDashboardKpis(db, branchId);
export const fetchReorderTable = (branchId: string | null) =>
	getReorderTable(db, branchId);
export const fetchBranchOptions = () => getBranchOptions(db);
export const fetchDailyRevenue = (branchId: string | null) =>
	getDailyRevenue(db, branchId);
export const fetchOrderFunnel = (branchId: string | null) =>
	getOrderFunnel(db, branchId);
export const fetchRatingDistribution = () => getRatingDistribution(db);
export const fetchToolStatus = () => getToolStatusBreakdown(db);
export const fetchNewClients = () => getNewClients(db);
export const fetchPromotionStatus = () => getPromotionStatusBreakdown(db);
export const fetchStockFlow = (branchId: string | null) =>
	getStockFlow(db, branchId);
