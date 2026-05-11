"use server";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	type StockAdjustmentInput,
	stockAdjustmentSchema,
} from "./_components/stock-adjustment-schema";
import {
	type StockThresholdInput,
	stockThresholdSchema,
} from "./_components/stock-threshold-schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

interface AdjustStockSuccess {
	delta: number;
	movementId: string | null;
	newQty: number;
	previousQty: number;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}

export async function adjustStock(
	input: StockAdjustmentInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const session = await requireCapability("stock.adjust");

	const parsed = stockAdjustmentSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return {
			ok: false,
			error: firstIssue?.message ?? "Entrada inválida",
		};
	}

	const { variantId, branchId, newQty, reason, reasonNote } = parsed.data;
	const actorId = session.user.id;

	try {
		const result = await db.transaction(async (tx) => {
			await tx
				.insert(stockLevel)
				.values({
					variantId,
					branchId,
					quantity: 0,
					updatedAt: new Date(),
				})
				.onConflictDoNothing({
					target: [stockLevel.variantId, stockLevel.branchId],
				});

			const lockedRows = await tx
				.select({ quantity: stockLevel.quantity })
				.from(stockLevel)
				.where(
					and(
						eq(stockLevel.variantId, variantId),
						eq(stockLevel.branchId, branchId)
					)
				)
				.for("update");

			const previousQty = lockedRows[0]?.quantity ?? 0;
			const delta = newQty - previousQty;

			if (delta === 0) {
				return { previousQty, delta, movementId: null as string | null };
			}

			await tx
				.update(stockLevel)
				.set({ quantity: newQty, updatedAt: new Date() })
				.where(
					and(
						eq(stockLevel.variantId, variantId),
						eq(stockLevel.branchId, branchId)
					)
				);

			const movementId = crypto.randomUUID();
			await tx.insert(stockMovement).values({
				id: movementId,
				variantId,
				branchId,
				previousQty,
				newQty,
				delta,
				reason: reason ?? "ajuste_inventario",
				reasonNote: reasonNote ?? null,
				actorType: "user",
				actorId,
			});

			return { previousQty, delta, movementId: movementId as string | null };
		});

		// Recupera toolId associado para revalidação de paths.
		const [variantRow] = await db
			.select({ toolId: toolVariant.toolId })
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId))
			.limit(1);
		const toolId = variantRow?.toolId;

		revalidatePath("/dashboard/stock");
		revalidatePath("/dashboard/stock/branches");
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		if (toolId) {
			revalidatePath(`/dashboard/tools/${toolId}/stock`);
		}

		return {
			ok: true,
			data: {
				previousQty: result.previousQty,
				newQty,
				delta: result.delta,
				movementId: result.movementId,
			},
		};
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export async function updateStockThresholds(
	input: StockThresholdInput
): Promise<ActionResult> {
	await requireCapability("stock.adjust");

	const parsed = stockThresholdSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return {
			ok: false,
			error: firstIssue?.message ?? "Entrada inválida",
		};
	}

	const { variantId, branchId, minQty, reorderPoint } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			await tx
				.insert(stockLevel)
				.values({
					variantId,
					branchId,
					quantity: 0,
					minQty,
					reorderPoint,
					updatedAt: new Date(),
				})
				.onConflictDoNothing({
					target: [stockLevel.variantId, stockLevel.branchId],
				});

			await tx
				.update(stockLevel)
				.set({ minQty, reorderPoint, updatedAt: new Date() })
				.where(
					and(
						eq(stockLevel.variantId, variantId),
						eq(stockLevel.branchId, branchId)
					)
				);
		});

		const [variantRow] = await db
			.select({ toolId: toolVariant.toolId })
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId))
			.limit(1);
		const toolId = variantRow?.toolId;

		revalidatePath("/dashboard/stock");
		revalidatePath("/dashboard/stock/branches");
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		if (toolId) {
			revalidatePath(`/dashboard/tools/${toolId}/stock`);
		}

		return { ok: true, data: undefined };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export interface StockMovementRow {
	actorId: string | null;
	actorName: string | null;
	branchId: string | null;
	branchName: string | null;
	createdAt: Date;
	delta: number;
	id: string;
	newQty: number;
	previousQty: number;
	reason: string | null;
	reasonNote: string | null;
}

// ---------------------------------------------------------------------------
// Cursor-based pagination para Stock Geral
// ---------------------------------------------------------------------------

export type StockSort =
	| "urgency"
	| "newest"
	| "name"
	| "stockHigh"
	| "stockLow";

export interface StockFiltersInput {
	categoryId?: string;
	search?: string;
	sort: StockSort;
}

interface StockPageRow extends Record<string, unknown> {
	branches_breakdown: Array<{
		branch_id: string;
		branch_name: string;
		quantity: number;
	}> | null;
	created_at: string;
	default_sku: string | null;
	default_voltage: string | null;
	id: string;
	image_url: string | null;
	name: string;
	primary_category_name: string | null;
	reorder_count: number;
	slug: string | null;
	total_stock: number;
	variant_count: number;
	variant_voltages: string[];
}

function buildStockWhereClause(filters: StockFiltersInput) {
	const parts: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		parts.push(sql`t.name ILIKE ${`%${filters.search}%`}`);
	}
	if (filters.categoryId) {
		parts.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId})`
		);
	}
	return parts;
}

function buildStockOrderClause(sort: StockSort) {
	if (sort === "newest") {
		return sql`ORDER BY t.created_at DESC, t.id DESC`;
	}
	if (sort === "name") {
		return sql`ORDER BY t.name ASC, t.id ASC`;
	}
	if (sort === "stockHigh") {
		return sql`ORDER BY total_stock DESC, t.id DESC`;
	}
	if (sort === "stockLow") {
		return sql`ORDER BY total_stock ASC, t.id ASC`;
	}
	return sql`ORDER BY reorder_count DESC, total_stock ASC, t.created_at DESC, t.id DESC`;
}

function buildStockCursorPredicate(
	decoded: ReturnType<typeof decodeCursor> | null,
	sort: StockSort
) {
	if (!decoded) {
		return null;
	}
	if (sort === "newest" && decoded.sort === "newest") {
		return sql`(t.created_at, t.id) < (${decoded.createdAt}::timestamp, ${decoded.id})`;
	}
	if (sort === "name" && decoded.sort === "name") {
		return sql`(t.name, t.id) > (${decoded.name}, ${decoded.id})`;
	}
	if (sort === "stockHigh" && decoded.sort === "stockHigh") {
		return sql`(total_stock, t.id) < (${decoded.totalStock}, ${decoded.id})`;
	}
	if (sort === "stockLow" && decoded.sort === "stockLow") {
		return sql`(total_stock, t.id) > (${decoded.totalStock}, ${decoded.id})`;
	}
	if (sort === "urgency" && decoded.sort === "urgency") {
		return sql`(
			reorder_count < ${decoded.reorderCount}
			OR (reorder_count = ${decoded.reorderCount} AND total_stock > ${decoded.totalStock})
			OR (reorder_count = ${decoded.reorderCount} AND total_stock = ${decoded.totalStock} AND t.created_at < ${decoded.createdAt}::timestamp)
			OR (reorder_count = ${decoded.reorderCount} AND total_stock = ${decoded.totalStock} AND t.created_at = ${decoded.createdAt}::timestamp AND t.id < ${decoded.id})
		)`;
	}
	return null;
}

export async function fetchStockPage({
	filters,
	cursor,
}: {
	filters: StockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);

	if (scope !== null && scope.length === 0) {
		return { items: [], nextCursor: null };
	}

	const decoded = cursor ? decodeCursor(cursor) : null;
	const where = buildStockWhereClause(filters);
	const cursorPred = buildStockCursorPredicate(decoded, filters.sort);
	if (cursorPred) {
		where.push(cursorPred);
	}

	const whereClause = where.length
		? sql`WHERE ${sql.join(where, sql` AND `)}`
		: sql``;
	const orderClause = buildStockOrderClause(filters.sort);

	const branchFilter =
		scope === null
			? sql``
			: sql`AND sl.branch_id = ANY(ARRAY[${sql.join(
					scope.map((id) => sql`${id}`),
					sql`, `
				)}]::uuid[])`;
	const branchFilter2 =
		scope === null
			? sql``
			: sql`AND sl2.branch_id = ANY(ARRAY[${sql.join(
					scope.map((id) => sql`${id}`),
					sql`, `
				)}]::uuid[])`;

	const result = await db.execute<StockPageRow>(sql`
		WITH base AS (
			SELECT
				t.id, t.name, t.slug, t.created_at,
				(SELECT tv.sku FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_sku,
				(SELECT tv.voltage::text FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_voltage,
				(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
				(SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
					FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_voltages,
				(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
				(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id
					WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS primary_category_name,
				COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id ${branchFilter}), 0) AS total_stock,
				COALESCE((SELECT COUNT(*)::int FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id AND sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point ${branchFilter}), 0) AS reorder_count,
				COALESCE((SELECT json_agg(json_build_object('branch_id', b.id, 'branch_name', b.name, 'quantity', branch_total) ORDER BY b.name ASC)
					FROM (SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
						FROM stock_level sl2 JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
						JOIN branch b2 ON b2.id = sl2.branch_id WHERE tv2.tool_id = t.id ${branchFilter2} GROUP BY b2.id) g
					JOIN branch b ON b.id = g.bid), '[]'::json) AS branches_breakdown
			FROM tool t
		)
		SELECT
			id, name, slug, default_sku, default_voltage, variant_count, variant_voltages,
			image_url, primary_category_name, total_stock, reorder_count, branches_breakdown,
			created_at::text AS created_at
		FROM base t
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = result.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		imageUrl: r.image_url,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		variantSummaries: r.variant_voltages ?? [],
		primaryCategoryName: r.primary_category_name,
		supplierName: null,
		status: "active" as const,
		visibleOnSite: true,
		totalStock: Number(r.total_stock ?? 0),
		reorderCount: Number(r.reorder_count ?? 0),
		branches: (r.branches_breakdown ?? []).map((b) => ({
			branchId: b.branch_id,
			branchName: b.branch_name,
			quantity: b.quantity,
		})),
		__createdAt: r.created_at,
		__name: r.name,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		const id = last.id;
		if (filters.sort === "newest") {
			nextCursor = encodeCursor({
				v: 1,
				sort: "newest",
				createdAt: last.__createdAt,
				id,
			});
		} else if (filters.sort === "name") {
			nextCursor = encodeCursor({
				v: 1,
				sort: "name",
				name: last.__name,
				id,
			});
		} else if (filters.sort === "stockHigh") {
			nextCursor = encodeCursor({
				v: 1,
				sort: "stockHigh",
				totalStock: last.totalStock,
				id,
			});
		} else if (filters.sort === "stockLow") {
			nextCursor = encodeCursor({
				v: 1,
				sort: "stockLow",
				totalStock: last.totalStock,
				id,
			});
		} else {
			nextCursor = encodeCursor({
				v: 1,
				sort: "urgency",
				reorderCount: last.reorderCount,
				totalStock: last.totalStock,
				createdAt: last.__createdAt,
				id,
			});
		}
	}

	const cleanItems: ToolCardData[] = items.map(
		({ __createdAt: _c, __name: _n, ...rest }) => rest
	);

	return { items: cleanItems, nextCursor };
}

/**
 * Lista movimentos de estoque para todas as variantes de uma tool.
 */
export async function getStockMovements(
	toolId: string,
	limit = 50
): Promise<StockMovementRow[]> {
	return await db
		.select({
			id: stockMovement.id,
			createdAt: stockMovement.createdAt,
			branchId: stockMovement.branchId,
			branchName: branch.name,
			previousQty: stockMovement.previousQty,
			newQty: stockMovement.newQty,
			delta: stockMovement.delta,
			reason: stockMovement.reason,
			reasonNote: stockMovement.reasonNote,
			actorId: stockMovement.actorId,
			actorName: user.name,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(eq(toolVariant.toolId, toolId))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}
