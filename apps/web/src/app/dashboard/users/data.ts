import "server-only";

import { db } from "@emach/db";
import {
	session as sessionTable,
	user as userTable,
} from "@emach/db/schema/auth";
import { branch, userBranch } from "@emach/db/schema/inventory";
import { userActivityLog } from "@emach/db/schema/user-activity";
import { and, desc, eq, gt, ilike, lte, or, type SQL, sql } from "drizzle-orm";

import { decodeCursorAs, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

// ============================================================================
// KPIs
// ============================================================================

export interface UserKpis {
	active: number;
	branchesCovered: number;
	pending: number;
	suspended: number;
}

export async function getUserKpis(): Promise<UserKpis> {
	const [counts] = await db
		.select({
			active: sql<number>`count(*) filter (where ${userTable.status} = 'active')::int`,
			pending: sql<number>`count(*) filter (where ${userTable.status} = 'pending')::int`,
			suspended: sql<number>`count(*) filter (where ${userTable.status} = 'suspended')::int`,
		})
		.from(userTable);
	const [branchesCovered] = await db
		.select({ n: sql<number>`count(distinct ${userBranch.branchId})::int` })
		.from(userBranch);
	return {
		active: counts?.active ?? 0,
		pending: counts?.pending ?? 0,
		suspended: counts?.suspended ?? 0,
		branchesCovered: branchesCovered?.n ?? 0,
	};
}

// ============================================================================
// LISTAGEM
// ============================================================================

export interface UserListRow {
	branchIds: string[];
	branchNames: string[];
	createdAt: Date;
	email: string;
	id: string;
	image: string | null;
	lastLoginAt: Date | null;
	name: string;
	role: "super_admin" | "admin" | "manager" | "user";
	status: "pending" | "active" | "suspended";
}

export interface UserListFilters {
	branchId?: string;
	cursor?: string | null;
	limit?: number;
	role?: "super_admin" | "admin" | "manager" | "user";
	search?: string;
	status?: "active" | "pending" | "suspended";
}

export async function fetchUsersPage(
	filters: UserListFilters
): Promise<InfiniteResult<UserListRow>> {
	const limit = filters.limit ?? BATCH_SIZE;
	const decoded = filters.cursor
		? decodeCursorAs(filters.cursor, "newest")
		: null;

	const whereParts: SQL[] = [];
	if (filters.status) {
		whereParts.push(eq(userTable.status, filters.status));
	}
	if (filters.role) {
		whereParts.push(eq(userTable.role, filters.role));
	}
	if (filters.search) {
		const searchClause = or(
			ilike(userTable.name, `%${filters.search}%`),
			ilike(userTable.email, `%${filters.search}%`)
		);
		if (searchClause) {
			whereParts.push(searchClause);
		}
	}
	if (filters.branchId) {
		whereParts.push(
			sql`${userTable.id} IN (SELECT ${userBranch.userId} FROM ${userBranch} WHERE ${userBranch.branchId} = ${filters.branchId})`
		);
	}
	if (decoded) {
		whereParts.push(
			sql`(${userTable.createdAt}, ${userTable.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
		);
	}

	const rows = await db
		.select({
			branchIds: sql<
				string[]
			>`coalesce(array_agg(${userBranch.branchId}) filter (where ${userBranch.branchId} is not null), '{}')`,
			branchNames: sql<
				string[]
			>`coalesce(array_agg(${branch.name}) filter (where ${branch.id} is not null), '{}')`,
			createdAt: userTable.createdAt,
			email: userTable.email,
			id: userTable.id,
			image: userTable.image,
			lastLoginAt: userTable.lastLoginAt,
			name: userTable.name,
			role: userTable.role,
			status: userTable.status,
		})
		.from(userTable)
		.leftJoin(userBranch, eq(userBranch.userId, userTable.id))
		.leftJoin(branch, eq(branch.id, userBranch.branchId))
		.where(whereParts.length ? and(...whereParts) : undefined)
		.groupBy(userTable.id)
		.orderBy(desc(userTable.createdAt), desc(userTable.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = (hasMore ? rows.slice(0, limit) : rows) as UserListRow[];
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return { items, nextCursor };
}

export async function fetchPendingUsersPage(cursor: string | null): Promise<
	InfiniteResult<{
		href: string;
		id: string;
		primary: string;
		secondary: string;
	}>
> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select({
			createdAt: userTable.createdAt,
			email: userTable.email,
			id: userTable.id,
			name: userTable.name,
		})
		.from(userTable)
		.where(
			and(
				eq(userTable.status, "pending"),
				decoded
					? sql`(${userTable.createdAt}, ${userTable.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
					: undefined
			)
		)
		.orderBy(desc(userTable.createdAt), desc(userTable.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return {
		items: items.map((r) => ({
			href: `/dashboard/users/${r.id}`,
			id: r.id,
			primary: r.name,
			secondary: r.email,
		})),
		nextCursor,
	};
}

// ============================================================================
// DETAIL
// ============================================================================

export interface UserDetail extends UserListRow {
	emailVerified: boolean;
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
	const [row] = await db
		.select({
			branchIds: sql<
				string[]
			>`coalesce(array_agg(${userBranch.branchId}) filter (where ${userBranch.branchId} is not null), '{}')`,
			branchNames: sql<
				string[]
			>`coalesce(array_agg(${branch.name}) filter (where ${branch.id} is not null), '{}')`,
			createdAt: userTable.createdAt,
			email: userTable.email,
			emailVerified: userTable.emailVerified,
			id: userTable.id,
			image: userTable.image,
			lastLoginAt: userTable.lastLoginAt,
			name: userTable.name,
			role: userTable.role,
			status: userTable.status,
		})
		.from(userTable)
		.leftJoin(userBranch, eq(userBranch.userId, userTable.id))
		.leftJoin(branch, eq(branch.id, userBranch.branchId))
		.where(eq(userTable.id, id))
		.groupBy(userTable.id);
	return (row as UserDetail) ?? null;
}

// ============================================================================
// SESSIONS
// ============================================================================

export async function getUserSessions(userId: string) {
	return await db
		.select({
			createdAt: sessionTable.createdAt,
			expiresAt: sessionTable.expiresAt,
			id: sessionTable.id,
			ipAddress: sessionTable.ipAddress,
			userAgent: sessionTable.userAgent,
		})
		.from(sessionTable)
		.where(
			and(
				eq(sessionTable.userId, userId),
				gt(sessionTable.expiresAt, new Date())
			)
		)
		.orderBy(desc(sessionTable.createdAt));
}

// ============================================================================
// ACTIVITY
// ============================================================================

export interface UserActivityRow {
	action: string;
	createdAt: Date;
	id: string;
	metadata: Record<string, unknown> | null;
	targetId: string | null;
	targetType: string | null;
}

export async function getUserActivity(
	userId: string,
	cursor: string | null,
	limit = 25
): Promise<InfiniteResult<UserActivityRow>> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select()
		.from(userActivityLog)
		.where(
			and(
				eq(userActivityLog.actorUserId, userId),
				decoded
					? lte(userActivityLog.createdAt, new Date(decoded.createdAt))
					: undefined
			)
		)
		.orderBy(desc(userActivityLog.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return {
		items: items.map((r) => ({
			action: r.action,
			createdAt: r.createdAt,
			id: r.id,
			metadata: r.metadata ?? null,
			targetId: r.targetId,
			targetType: r.targetType,
		})),
		nextCursor,
	};
}

/**
 * Atividade SOFRIDA pelo user (target). Filtra por targetType='user' + targetId.
 */
export async function getUserAffectedActivity(
	userId: string,
	cursor: string | null,
	limit = 25
): Promise<InfiniteResult<UserActivityRow & { actorName: string | null }>> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select({
			id: userActivityLog.id,
			action: userActivityLog.action,
			createdAt: userActivityLog.createdAt,
			metadata: userActivityLog.metadata,
			targetId: userActivityLog.targetId,
			targetType: userActivityLog.targetType,
			actorName: userTable.name,
		})
		.from(userActivityLog)
		.leftJoin(userTable, eq(userTable.id, userActivityLog.actorUserId))
		.where(
			and(
				eq(userActivityLog.targetType, "user"),
				eq(userActivityLog.targetId, userId),
				decoded
					? lte(userActivityLog.createdAt, new Date(decoded.createdAt))
					: undefined
			)
		)
		.orderBy(desc(userActivityLog.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return {
		items: items.map((r) => ({
			action: r.action,
			actorName:
				r.actorName ??
				((r.metadata as Record<string, unknown> | null)?.actorName as
					| string
					| null) ??
				null,
			createdAt: r.createdAt,
			id: r.id,
			metadata: (r.metadata as Record<string, unknown> | null) ?? null,
			targetId: r.targetId,
			targetType: r.targetType,
		})),
		nextCursor,
	};
}

export async function getUserActivityFeedPaginated(
	cursor: string | null,
	limit = 20
): Promise<
	InfiniteResult<{
		action: string;
		actorName: string | null;
		createdAt: Date;
		id: string;
		targetId: string | null;
	}>
> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select({
			action: userActivityLog.action,
			actorName: userTable.name,
			createdAt: userActivityLog.createdAt,
			id: userActivityLog.id,
			targetId: userActivityLog.targetId,
		})
		.from(userActivityLog)
		.leftJoin(userTable, eq(userTable.id, userActivityLog.actorUserId))
		.where(
			and(
				ilike(userActivityLog.action, "user.%"),
				decoded
					? sql`(${userActivityLog.createdAt}, ${userActivityLog.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
					: undefined
			)
		)
		.orderBy(desc(userActivityLog.createdAt), desc(userActivityLog.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return { items, nextCursor };
}

export async function getRecentUserActivity(limit = 8) {
	return await db
		.select({
			action: userActivityLog.action,
			actorName: userTable.name,
			createdAt: userActivityLog.createdAt,
			id: userActivityLog.id,
			targetId: userActivityLog.targetId,
		})
		.from(userActivityLog)
		.leftJoin(userTable, eq(userTable.id, userActivityLog.actorUserId))
		.where(ilike(userActivityLog.action, "user.%"))
		.orderBy(desc(userActivityLog.createdAt))
		.limit(limit);
}
