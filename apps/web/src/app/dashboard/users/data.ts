import "server-only";

import { db } from "@emach/db";
import {
	account as accountTable,
	session as sessionTable,
	user as userTable,
} from "@emach/db/schema/auth";
import { branch, userBranch } from "@emach/db/schema/inventory";
import { userActivityLog } from "@emach/db/schema/user-activity";
import {
	and,
	asc,
	desc,
	eq,
	exists,
	gt,
	ilike,
	inArray,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import type { BranchScope } from "@/lib/branch-scope";

import { decodeCursorAs, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { getBranchTableAggregates } from "../branches/data";

// ============================================================================
// KPIs
// ============================================================================

export interface UserKpis {
	active: number;
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
	return {
		active: counts?.active ?? 0,
		pending: counts?.pending ?? 0,
		suspended: counts?.suspended ?? 0,
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
	role: "super_admin" | "admin" | "user";
	status: "pending" | "active" | "suspended";
}

export interface UserListFilters {
	branchId?: string;
	cursor?: string | null;
	limit?: number;
	role?: "super_admin" | "admin" | "user";
	scope?: BranchScope;
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
	if (filters.scope?.kind === "scoped") {
		const { branchIds } = filters.scope;
		if (branchIds.length === 0) {
			// Escopo cego: admin sem filial não vê nenhum usuário
			return { items: [], nextCursor: null };
		}
		// Só usuários de role='user' que compartilham ≥1 filial com o ator
		whereParts.push(
			eq(userTable.role, "user"),
			exists(
				db
					.select({ one: sql`1` })
					.from(userBranch)
					.where(
						and(
							eq(userBranch.userId, userTable.id),
							inArray(userBranch.branchId, branchIds)
						)
					)
			)
		);
	}
	if (decoded) {
		whereParts.push(
			sql`(${userTable.createdAt}, ${userTable.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
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
					? sql`(${userTable.createdAt}, ${userTable.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
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
	provider: string | null;
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
	if (!row) {
		return null;
	}

	// Subquery escalar correlacionada no db.select builder retorna null em runtime
	// (armadilha documentada em packages/db/CLAUDE.md). Buscar provider em query separada.
	const [acc] = await db
		.select({ providerId: accountTable.providerId })
		.from(accountTable)
		.where(eq(accountTable.userId, id))
		.orderBy(asc(accountTable.createdAt))
		.limit(1);

	return { ...(row as UserDetail), provider: acc?.providerId ?? null };
}

// ============================================================================
// DETAIL KPIS
// ============================================================================

export interface UserDetailKpis {
	activeSessions: number;
	createdAt: Date;
	lastLoginAt: Date | null;
	linkedBranches: number;
}

export async function getUserDetailKpis(
	userId: string
): Promise<UserDetailKpis> {
	const [[branches], [sessions], [u]] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(userBranch)
			.where(eq(userBranch.userId, userId)),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(sessionTable)
			.where(
				and(
					eq(sessionTable.userId, userId),
					gt(sessionTable.expiresAt, new Date())
				)
			),
		db
			.select({
				createdAt: userTable.createdAt,
				lastLoginAt: userTable.lastLoginAt,
			})
			.from(userTable)
			.where(eq(userTable.id, userId)),
	]);
	return {
		activeSessions: sessions?.n ?? 0,
		createdAt: u?.createdAt ?? new Date(0),
		lastLoginAt: u?.lastLoginAt ?? null,
		linkedBranches: branches?.n ?? 0,
	};
}

// ============================================================================
// LINKED BRANCHES WITH STATS
// ============================================================================

export interface UserLinkedBranch {
	activeSkus: number;
	city: string | null;
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

export async function getUserLinkedBranchesWithStats(
	userId: string
): Promise<UserLinkedBranch[]> {
	// Buscar filiais vinculadas ao userId
	const linkedBranches = await db
		.select({
			id: branch.id,
			name: branch.name,
			city: branch.city,
			neighborhood: branch.neighborhood,
			state: branch.state,
			street: branch.street,
			streetNumber: branch.streetNumber,
			status: branch.status,
		})
		.from(branch)
		.where(
			sql`${branch.id} IN (SELECT ${userBranch.branchId} FROM ${userBranch} WHERE ${userBranch.userId} = ${userId})`
		)
		.orderBy(asc(branch.name));

	if (linkedBranches.length === 0) {
		return [];
	}

	const branchIds = linkedBranches.map((b) => b.id);
	// Reusa a agregação canônica da listagem de filiais (mesmo cálculo de
	// teamCount/activeSkus/lowStock) em vez de duplicar as queries.
	const stats = await getBranchTableAggregates(branchIds);

	return linkedBranches.map((b) => {
		const s = stats.get(b.id);
		return {
			...b,
			teamCount: s?.teamCount ?? 0,
			activeSkus: s?.activeSkus ?? 0,
			lowStock: s?.lowStock ?? 0,
		};
	});
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
					? sql`(${userActivityLog.createdAt}, ${userActivityLog.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
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

export interface InviteByToken {
	email: string;
	userId: string;
}

export async function getInviteByToken(
	token: string
): Promise<InviteByToken | null> {
	const [row] = await db
		.select({
			userId: userTable.id,
			email: userTable.email,
			status: userTable.status,
			expiresAt: userTable.inviteTokenExpiresAt,
		})
		.from(userTable)
		.where(eq(userTable.inviteToken, token))
		.limit(1);

	if (!row || row.status !== "pending") {
		return null;
	}
	if (!row.expiresAt || row.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return { userId: row.userId, email: row.email };
}
