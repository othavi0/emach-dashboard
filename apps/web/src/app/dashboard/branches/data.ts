import "server-only";

import { db } from "@emach/db";
import {
	OPEN_ORDER_STATUSES,
	sqlStatusList,
} from "@emach/db/order-status-groups";
import { user as userTable } from "@emach/db/schema/auth";
import { branch, stockLevel, userBranch } from "@emach/db/schema/inventory";
import { order } from "@emach/db/schema/orders";
import { toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

export interface EligibleUserOption {
	email: string;
	id: string;
	name: string;
}

export async function getEligibleUsersForBranch(
	branchId: string,
	search: string
): Promise<EligibleUserOption[]> {
	const linkedSub = db
		.select({ uid: userBranch.userId })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId));
	const pattern = `%${search}%`;
	return await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
		})
		.from(userTable)
		.where(
			sql`${userTable.status} = 'active'
			    and ${userTable.id} not in ${linkedSub}
			    and (${userTable.name} ilike ${pattern} or ${userTable.email} ilike ${pattern})`
		)
		.limit(20);
}

export interface BranchKpis {
	lowStockCount: number;
	openOrders: number;
	stockValue: number;
	total: number;
}

export async function getBranchKpis(): Promise<BranchKpis> {
	const [total] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(branch);
	const [low] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(stockLevel)
		.where(
			sql`${stockLevel.quantity} <= coalesce(${stockLevel.minQty}, 0) and coalesce(${stockLevel.minQty}, 0) > 0`
		);
	const [value] = await db
		.select({
			v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.priceAmount}, 0)), 0)::float`,
		})
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId));
	const [open] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.status} in (${sqlStatusList(OPEN_ORDER_STATUSES)})`);
	return {
		total: total?.n ?? 0,
		lowStockCount: low?.n ?? 0,
		stockValue: value?.v ?? 0,
		openOrders: open?.n ?? 0,
	};
}

export interface BranchDetail {
	cep: string | null;
	cepRanges: Array<{ from: string; to: string }> | null;
	city: string | null;
	complement: string | null;
	createdAt: Date;
	id: string;
	name: string;
	neighborhood: string | null;
	phone: string | null;
	responsibleName: string | null;
	responsibleUserId: string | null;
	state: string | null;
	status: "active" | "inactive";
	street: string | null;
	streetNumber: string | null;
	updatedAt: Date;
}

export async function getBranchDetail(
	id: string
): Promise<BranchDetail | null> {
	const [row] = await db
		.select({
			id: branch.id,
			name: branch.name,
			phone: branch.phone,
			cep: branch.cep,
			cepRanges: branch.cepRanges,
			street: branch.street,
			streetNumber: branch.streetNumber,
			complement: branch.complement,
			neighborhood: branch.neighborhood,
			city: branch.city,
			state: branch.state,
			status: branch.status,
			responsibleUserId: branch.responsibleUserId,
			responsibleName: userTable.name,
			createdAt: branch.createdAt,
			updatedAt: branch.updatedAt,
		})
		.from(branch)
		.leftJoin(userTable, eq(userTable.id, branch.responsibleUserId))
		.where(eq(branch.id, id))
		.limit(1);
	return (row as BranchDetail) ?? null;
}

export interface BranchDetailKpis {
	orders30d: number;
	skuCount: number;
	stockValue: number;
	teamSize: number;
}

export async function getBranchDetailKpis(
	branchId: string
): Promise<BranchDetailKpis> {
	const [skus] = await db
		.select({
			n: sql<number>`count(distinct ${stockLevel.variantId})::int`,
		})
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, branchId), gt(stockLevel.quantity, 0)));
	const [value] = await db
		.select({
			v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.priceAmount}, 0)), 0)::float`,
		})
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
		.where(eq(stockLevel.branchId, branchId));
	const [team] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId));
	const [recent] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(
			sql`${order.branchId} = ${branchId} and ${order.createdAt} >= now() - interval '30 days'`
		);
	return {
		skuCount: skus?.n ?? 0,
		stockValue: value?.v ?? 0,
		teamSize: team?.n ?? 0,
		orders30d: recent?.n ?? 0,
	};
}

export interface BranchTeamRow {
	email: string;
	image: string | null;
	linkedAt: Date;
	name: string;
	role: "super_admin" | "admin" | "manager" | "user";
	userId: string;
}

export async function getBranchTeam(
	branchId: string
): Promise<BranchTeamRow[]> {
	return await db
		.select({
			userId: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			image: userTable.image,
			linkedAt: userBranch.createdAt,
		})
		.from(userBranch)
		.innerJoin(userTable, eq(userTable.id, userBranch.userId))
		.where(eq(userBranch.branchId, branchId))
		.orderBy(desc(userBranch.createdAt));
}

export interface BranchOrderRow {
	createdAt: Date;
	id: string;
	number: string;
	status: string;
	totalAmount: string;
}

export async function getBranchRecentOrders(
	branchId: string,
	limit = 20
): Promise<BranchOrderRow[]> {
	return await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(eq(order.branchId, branchId))
		.orderBy(desc(order.createdAt))
		.limit(limit);
}

export interface BranchTableRow {
	activeSkus: number;
	city: string | null;
	createdAt: Date;
	id: string;
	lowStock: number;
	name: string;
	neighborhood: string | null;
	state: string | null;
	status: "active" | "inactive";
	street: string | null;
	streetNumber: string | null;
	teamCount: number;
}

export async function getBranchTableAggregates(
	branchIds: string[]
): Promise<
	Map<string, { teamCount: number; activeSkus: number; lowStock: number }>
> {
	if (branchIds.length === 0) {
		return new Map();
	}
	const teamRows = await db
		.select({
			branchId: userBranch.branchId,
			n: sql<number>`count(*)::int`,
		})
		.from(userBranch)
		.where(inArray(userBranch.branchId, branchIds))
		.groupBy(userBranch.branchId);
	const stockRows = await db
		.select({
			branchId: stockLevel.branchId,
			active: sql<number>`count(*) filter (where ${stockLevel.quantity} > 0)::int`,
			low: sql<number>`count(*) filter (where ${stockLevel.quantity} <= coalesce(${stockLevel.minQty}, 0) and coalesce(${stockLevel.minQty}, 0) > 0)::int`,
		})
		.from(stockLevel)
		.where(inArray(stockLevel.branchId, branchIds))
		.groupBy(stockLevel.branchId);
	const map = new Map<
		string,
		{ teamCount: number; activeSkus: number; lowStock: number }
	>();
	for (const id of branchIds) {
		map.set(id, { teamCount: 0, activeSkus: 0, lowStock: 0 });
	}
	for (const r of teamRows) {
		const v = map.get(r.branchId);
		if (v) {
			v.teamCount = r.n;
		}
	}
	for (const r of stockRows) {
		const v = map.get(r.branchId);
		if (v) {
			v.activeSkus = r.active;
			v.lowStock = r.low;
		}
	}
	return map;
}
