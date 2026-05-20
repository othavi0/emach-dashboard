"use server";

import { db } from "@emach/db";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { order } from "@emach/db/schema/orders";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logUserActivity } from "@/lib/activity";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import {
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import {
	type BranchFormValues,
	branchSchema,
} from "./_components/branch-schema";
import type { BranchTableRow } from "./data";

const BRANCHES_PATH = "/dashboard/branches";

export type BranchListItem = typeof branch.$inferSelect;

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function normalizePayload(input: BranchFormValues) {
	const address = input.address?.trim();
	const phone = input.phone?.trim();
	const responsibleUserId = input.responsibleUserId?.trim();
	return {
		name: input.name,
		address: address ? address : null,
		phone: phone ? phone : null,
		responsibleUserId: responsibleUserId ? responsibleUserId : null,
	};
}

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

export async function listBranches(): Promise<BranchListItem[]> {
	return await db.select().from(branch).orderBy(asc(branch.name));
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
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		conditions.push(sql`${branch.name} ILIKE ${`%${filters.search}%`}`);
	}
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			conditions.push(
				sql`(${branch.createdAt}, ${branch.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
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
	const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function createBranch(
	input: BranchFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("branches.manage");

	const parsed = branchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(branch).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
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
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	try {
		await db.update(branch).set(payload).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
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

export async function deleteBranch(id: string): Promise<ActionResult> {
	const session = await requireCapability("branches.manage");

	const [target] = await db
		.select({ isDefault: branch.isDefault, name: branch.name })
		.from(branch)
		.where(eq(branch.id, id))
		.limit(1);

	if (!target) {
		return { ok: false, error: "Filial não encontrada" };
	}

	if (target.isDefault) {
		return {
			ok: false,
			error: "Marque outra filial como padrão antes de deletar esta",
		};
	}

	const [stockCheck] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, id), gt(stockLevel.quantity, 0)));

	if ((stockCheck?.n ?? 0) > 0) {
		return {
			ok: false,
			error: `Filial tem ${stockCheck?.n} variante(s) com estoque positivo. Transfira ou zere antes de deletar.`,
		};
	}

	const [openOrders] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(
			sql`${order.branchId} = ${id} and ${order.status} in ('pending_payment','paid','preparing','shipped')`
		);

	if ((openOrders?.n ?? 0) > 0) {
		return {
			ok: false,
			error: `Filial tem ${openOrders?.n} pedido(s) em andamento. Conclua ou cancele antes de deletar.`,
		};
	}

	try {
		await db.delete(branch).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "branch.deleted",
		targetId: id,
		targetType: "branch",
		metadata: { name: target.name },
	});
	revalidatePath(BRANCHES_PATH);
	revalidatePath("/dashboard/stock");
	revalidatePath("/dashboard/tools", "layout");
	return { ok: true, data: undefined };
}

export async function fetchBranchesTablePage({
	filters,
	cursor,
}: {
	filters: BranchesFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchTableRow>> {
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
			address: b.address,
			isDefault: b.isDefault,
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

export async function setDefaultBranch(
	branchId: string
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapabilityWithContext("branches.set_default");

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(branch)
				.set({ isDefault: false })
				.where(eq(branch.isDefault, true));
			await tx
				.update(branch)
				.set({ isDefault: true })
				.where(eq(branch.id, branchId));
		});
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "branch.set_default",
		targetId: branchId,
		targetType: "branch",
	});
	revalidatePath(BRANCHES_PATH);
	revalidatePath(`${BRANCHES_PATH}/${branchId}/edit`);
	return { ok: true, data: { id: branchId } };
}
