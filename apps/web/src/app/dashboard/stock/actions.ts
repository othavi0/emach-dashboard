"use server";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { order, orderItem } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";

import { toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { revalidatePath } from "next/cache";
import { decodeCursorAs, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	type STOCK_MOVEMENT_REASONS,
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
		revalidatePath(`/dashboard/branches/${branchId}`);
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		if (toolId) {
			revalidatePath(`/dashboard/tools/${toolId}/stock`);
		}
		revalidatePath("/dashboard", "layout");

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
		revalidatePath(`/dashboard/branches/${branchId}`);
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		if (toolId) {
			revalidatePath(`/dashboard/tools/${toolId}/stock`);
		}
		revalidatePath("/dashboard", "layout");

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

/**
 * Lista movimentos de estoque de uma variante específica em uma filial.
 */
export async function getStockMovementsByVariantBranch(
	variantId: string,
	branchId: string,
	limit = 5
): Promise<StockMovementRow[]> {
	await requireCurrentSession();
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
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(
			and(
				eq(stockMovement.variantId, variantId),
				eq(stockMovement.branchId, branchId)
			)
		)
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}

/**
 * Página de movimentos de uma variante numa filial (keyset por createdAt+id).
 * Usado pelo scroll interno + lazy load do card "Movimentos recentes" da drawer.
 */
export async function fetchVariantBranchMovementsPage(
	variantId: string,
	branchId: string,
	cursor: string | null
): Promise<InfiniteResult<StockMovementRow>> {
	await requireCurrentSession();

	const conditions = [
		eq(stockMovement.variantId, variantId),
		eq(stockMovement.branchId, branchId),
	];

	if (cursor) {
		const c = decodeCursorAs(cursor, "activity");
		const cursorClause = or(
			lt(stockMovement.createdAt, new Date(c.createdAt)),
			and(
				eq(stockMovement.createdAt, new Date(c.createdAt)),
				lt(stockMovement.id, c.id)
			)
		);
		if (cursorClause) {
			conditions.push(cursorClause);
		}
	}

	const rows = await db
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
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "activity",
					id: last.id,
					createdAt: last.createdAt.toISOString(),
				})
			: null;

	return { items, nextCursor };
}

export async function getReservedQtyByVariantBranch(
	variantId: string,
	branchId: string
): Promise<number> {
	await requireCurrentSession();
	const [row] = await db
		.select({
			reserved: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
		})
		.from(orderItem)
		.innerJoin(order, eq(orderItem.orderId, order.id))
		.where(
			and(
				eq(orderItem.variantId, variantId),
				eq(order.branchId, branchId),
				inArray(order.status, ["paid", "preparing"])
			)
		);
	return row?.reserved ?? 0;
}

export interface ToolActivityRow {
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
	variantSku: string;
	variantVoltage: string | null;
}

export async function getToolActivity(
	toolId: string,
	limit = 100
): Promise<ToolActivityRow[]> {
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
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(eq(toolVariant.toolId, toolId))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}

// Tool activity — cursor pagination + filters
// ---------------------------------------------------------------------------

export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "all";

export interface ToolActivityFilters {
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[];
	toolId: string;
}

const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

function computePeriodCutoff(period: PeriodPreset): Date | null {
	if (period === "all") {
		return null;
	}
	const now = new Date();
	if (period === "today") {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	return new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000);
}

export async function fetchToolActivityPage(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	await requireCapability("stock.read");

	const limit = BATCH_SIZE;
	const conditions = [eq(toolVariant.toolId, filters.toolId)];

	if (filters.branchId) {
		conditions.push(eq(stockMovement.branchId, filters.branchId));
	}
	if (filters.reasons && filters.reasons.length > 0) {
		conditions.push(
			inArray(
				stockMovement.reason,
				filters.reasons as (typeof STOCK_MOVEMENT_REASONS)[number][]
			)
		);
	}

	const cutoff = computePeriodCutoff(filters.period);
	if (cutoff) {
		conditions.push(gte(stockMovement.createdAt, cutoff));
	}

	if (cursor) {
		const c = decodeCursorAs(cursor, "activity");
		const cursorClause = or(
			lt(stockMovement.createdAt, new Date(c.createdAt)),
			and(
				eq(stockMovement.createdAt, new Date(c.createdAt)),
				lt(stockMovement.id, c.id)
			)
		);
		if (cursorClause) {
			conditions.push(cursorClause);
		}
	}

	const rows = await db
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
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "activity",
					id: last.id,
					createdAt: last.createdAt.toISOString(),
				})
			: null;

	return { items, nextCursor };
}
