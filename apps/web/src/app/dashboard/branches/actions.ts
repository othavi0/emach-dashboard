"use server";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch, userBranch } from "@emach/db/schema/inventory";
import { order } from "@emach/db/schema/orders";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import {
	type BranchFormValues,
	branchSchema,
} from "./_components/branch-schema";
import {
	type BranchActivityFilters,
	type BranchActivityRow,
	fetchBranchActivityPage as fetchBranchActivityPageImpl,
} from "./[id]/activity-data";
import type { BranchOrderRow, BranchTableRow } from "./data";

const BRANCHES_PATH = "/dashboard/branches";

/** Wrapper server-action: o feed de atividade da filial pagina pelo client. */
export async function fetchBranchActivityPage(
	filters: BranchActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<BranchActivityRow>> {
	// defesa-em-profundidade: impl em activity-data.ts já guarda
	await requireCapability("branches.read");
	return await fetchBranchActivityPageImpl(filters, cursor);
}

export type BranchListItem = typeof branch.$inferSelect;

function normalizePayload(input: BranchFormValues) {
	return {
		name: input.name,
		status: input.status,
		phone: input.phone ?? null,
		businessHours: input.businessHours,
		cep: input.cep ?? null, // já vem em dígitos via Zod transform
		street: input.street ?? null,
		streetNumber: input.streetNumber ?? null,
		complement: input.complement ?? null,
		neighborhood: input.neighborhood ?? null,
		city: input.city ?? null,
		state: input.state ?? null,
		responsibleUserId: input.responsibleUserId ?? null,
		cepRanges: input.cepRanges ?? null,
	};
}


export async function listBranches(opts?: {
	activeOnly?: boolean;
}): Promise<BranchListItem[]> {
	await requireCapability("branches.read");
	if (opts?.activeOnly) {
		return await db
			.select()
			.from(branch)
			.where(eq(branch.status, "active"))
			.orderBy(asc(branch.name));
	}
	return await db.select().from(branch).orderBy(asc(branch.name));
}

export interface ResponsibleCandidate {
	email: string;
	id: string;
	image: string | null;
	name: string;
	role: "super_admin" | "admin" | "user";
}

export async function listResponsibleCandidates(
	branchId: string
): Promise<ResponsibleCandidate[]> {
	await requireCapability("branches.manage");
	return await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			image: user.image,
		})
		.from(userBranch)
		.innerJoin(user, eq(userBranch.userId, user.id))
		.where(and(eq(userBranch.branchId, branchId), eq(user.status, "active")))
		.orderBy(asc(user.name));
}

export type BranchSort = "newest" | "name";

export interface BranchesFiltersInput {
	search?: string;
	sort: BranchSort;
}

export async function fetchBranchesPage({
	filters,
	cursor,
}: {
	filters: BranchesFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchListItem>> {
	await requireCapability("branches.read");
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		conditions.push(sql`${branch.name} ILIKE ${`%${filters.search}%`}`);
	}
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			conditions.push(
				sql`(${branch.createdAt}, ${branch.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			);
		} else if (filters.sort === "name" && decoded.sort === "name") {
			conditions.push(
				sql`(${branch.name}, ${branch.id}) > (${decoded.name}, ${decoded.id})`
			);
		}
	}

	const whereExpr =
		conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
	const orderExprs =
		filters.sort === "name"
			? [asc(branch.name), asc(branch.id)]
			: [desc(branch.createdAt), desc(branch.id)];

	const rows = await db
		.select()
		.from(branch)
		.where(whereExpr)
		.orderBy(...orderExprs)
		.limit(BATCH_SIZE + 1);
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		nextCursor =
			filters.sort === "name"
				? encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id })
				: encodeCursor({
						v: 1,
						sort: "newest",
						createdAt: last.createdAt.toISOString(),
						id: last.id,
					});
	}
	return { items, nextCursor };
}

export async function getBranch(id: string): Promise<BranchListItem | null> {
	await requireCapability("branches.read");
	const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function fetchBranchOrdersPage({
	branchId,
	cursor,
}: {
	branchId: string;
	cursor: string | null;
}): Promise<InfiniteResult<BranchOrderRow>> {
	await requireCapability("orders.read");
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions = [sql`${order.branchId} = ${branchId}`];
	if (decoded && decoded.sort === "newest") {
		conditions.push(
			sql`(${order.createdAt}, ${order.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		);
	}
	const rawRows = await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(sql.join(conditions, sql` AND `))
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(BATCH_SIZE + 1);
	const rows = rawRows.map((row) => ({
		...row,
		totalAmount: Number(row.totalAmount),
	}));
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
	return { items, nextCursor };
}

export async function createBranch(
	input: BranchFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("branches.manage");

	const parsed = branchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = { ...normalizePayload(parsed.data), responsibleUserId: null };

	try {
		await db.insert(branch).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "branch.created",
		targetId: id,
		targetType: "branch",
		metadata: { name: payload.name },
	});
	revalidatePath(BRANCHES_PATH);
	return { ok: true, data: { id } };
}

export async function updateBranch(
	id: string,
	input: BranchFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("branches.manage");

	const parsed = branchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	if (payload.responsibleUserId) {
		const [linked] = await db
			.select({ uid: userBranch.userId })
			.from(userBranch)
			.where(
				and(
					eq(userBranch.branchId, id),
					eq(userBranch.userId, payload.responsibleUserId)
				)
			)
			.limit(1);
		if (!linked) {
			return {
				ok: false,
				error: "Responsável precisa estar vinculado à filial",
			};
		}
	}

	try {
		await db.update(branch).set(payload).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "branch.updated",
		targetId: id,
		targetType: "branch",
		metadata: { name: payload.name },
	});
	revalidatePath(BRANCHES_PATH);
	revalidatePath(`${BRANCHES_PATH}/${id}/edit`);
	return { ok: true, data: { id } };
}

export async function fetchBranchesTablePage({
	filters,
	cursor,
}: {
	filters: BranchesFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchTableRow>> {
	await requireCapability("branches.read");
	const page = await fetchBranchesPage({ filters, cursor });
	if (page.items.length === 0) {
		return { items: [], nextCursor: null };
	}
	const ids = page.items.map((b) => b.id);
	const { getBranchTableAggregates } = await import("./data");
	const aggregates = await getBranchTableAggregates(ids);
	const items: BranchTableRow[] = page.items.map((b) => {
		const agg = aggregates.get(b.id) ?? {
			teamCount: 0,
			activeSkus: 0,
			lowStock: 0,
		};
		return {
			id: b.id,
			name: b.name,
			street: b.street,
			streetNumber: b.streetNumber,
			neighborhood: b.neighborhood,
			city: b.city,
			state: b.state,
			status: b.status,
			createdAt: b.createdAt,
			teamCount: agg.teamCount,
			activeSkus: agg.activeSkus,
			lowStock: agg.lowStock,
		};
	});
	return { items, nextCursor: page.nextCursor };
}

export async function searchEligibleUsers(
	branchId: string,
	search: string
): Promise<{ id: string; name: string; email: string }[]> {
	await requireCapability("users.update_branches");
	const { getEligibleUsersForBranch } = await import("./data");
	return getEligibleUsersForBranch(branchId, search);
}

export async function linkUserToBranchAction(input: {
	branchId: string;
	userId: string;
}): Promise<ActionResult> {
	const { linkUserToBranch } = await import("../users/actions");
	return linkUserToBranch(input);
}

export async function unlinkUserFromBranchAction(input: {
	branchId: string;
	userId: string;
}): Promise<ActionResult> {
	const { unlinkUserFromBranch } = await import("../users/actions");
	return unlinkUserFromBranch(input);
}
