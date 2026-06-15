"use server";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { order, orderItem } from "@emach/db/schema/orders";
import type { StockMovementReason } from "@emach/db/schema/stock-movements";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { supplier, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { revalidatePath } from "next/cache";

import { getPgError } from "@/lib/db-error";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

import {
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	type STOCK_MOVEMENT_REASONS,
	type StockEntryInput,
	type StockRecountInput,
	type StockWriteOffInput,
	stockEntrySchema,
	stockRecountSchema,
	stockWriteOffSchema,
} from "./_components/stock-movement-schema";

import {
	type StockThresholdInput,
	stockThresholdSchema,
} from "./_components/stock-threshold-schema";
import {
	computePeriodCutoff,
	encodeMovementCursor,
	movementKeysetCondition,
	type PeriodPreset,
} from "./_lib/movements-shared";

export type { PeriodPreset } from "./_lib/movements-shared";

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
	// Erro do Postgres (drizzle embrulha em .cause): nunca vazar SQL+params no toast.
	if (getPgError(error)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}
	// Erros de domínio (ex: "Estoque não pode ficar negativo") são seguros de exibir.
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}

// ─── Helper transacional ──────────────────────────────────────────────────────

type MovementMode =
	| { mode: "target"; newQty: number }
	| { mode: "delta"; deltaQty: number };

interface ApplyMovementArgs {
	actorId: string;
	branchId: string;
	op: MovementMode;
	reason: StockMovementReason;
	reasonNote: string | null;
	supplierId: string | null;
	variantId: string;
}

async function applyMovement(
	args: ApplyMovementArgs
): Promise<AdjustStockSuccess> {
	return await db.transaction(async (tx) => {
		await tx
			.insert(stockLevel)
			.values({
				variantId: args.variantId,
				branchId: args.branchId,
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
					eq(stockLevel.variantId, args.variantId),
					eq(stockLevel.branchId, args.branchId)
				)
			)
			.for("update");

		const previousQty = lockedRows[0]?.quantity ?? 0;
		const newQty =
			args.op.mode === "target"
				? args.op.newQty
				: previousQty + args.op.deltaQty;
		const delta = newQty - previousQty;

		if (newQty < 0) {
			throw new Error("Estoque não pode ficar negativo");
		}

		if (delta === 0) {
			return { previousQty, newQty, delta, movementId: null };
		}

		await tx
			.update(stockLevel)
			.set({ quantity: newQty, updatedAt: new Date() })
			.where(
				and(
					eq(stockLevel.variantId, args.variantId),
					eq(stockLevel.branchId, args.branchId)
				)
			);

		const movementId = crypto.randomUUID();
		await tx.insert(stockMovement).values({
			id: movementId,
			variantId: args.variantId,
			branchId: args.branchId,
			previousQty,
			newQty,
			delta,
			reason: args.reason,
			reasonNote: args.reasonNote,
			supplierId: args.supplierId,
			actorType: "user",
			actorId: args.actorId,
		});

		return { previousQty, newQty, delta, movementId };
	});
}

async function revalidateStockPaths(
	variantId: string,
	branchId: string
): Promise<void> {
	const [variantRow] = await db
		.select({ toolId: toolVariant.toolId })
		.from(toolVariant)
		.where(eq(toolVariant.id, variantId))
		.limit(1);
	const toolId = variantRow?.toolId;
	revalidatePath("/dashboard/stock");
	revalidatePath("/dashboard/stock/movements");
	revalidatePath(`/dashboard/branches/${branchId}`);
	revalidatePath(`/dashboard/branches/${branchId}/stock`);
	if (toolId) {
		revalidatePath(`/dashboard/tools/${toolId}/stock`);
	}
	revalidatePath("/dashboard", "layout");
}

// ─── Actions de escrita ───────────────────────────────────────────────────────

export async function recordStockEntry(
	input: StockEntryInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const parsed = stockEntrySchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}
	const { variantId, branchId, quantity, supplierId, note } = parsed.data;
	const session = await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [branchId],
	});
	try {
		const result = await applyMovement({
			variantId,
			branchId,
			op: { mode: "delta", deltaQty: quantity },
			reason: "entrada_compra",
			reasonNote: note ?? null,
			supplierId,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		// A relação fornecedor↔tool e os KPIs do fornecedor são derivados das
		// entradas: revalidar a aba Estoque + listagem após registrar uma.
		revalidatePath("/dashboard/suppliers");
		revalidatePath(`/dashboard/suppliers/${supplierId}`);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export async function recordStockWriteOff(
	input: StockWriteOffInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const parsed = stockWriteOffSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}
	const { variantId, branchId, quantity, reason, note } = parsed.data;
	const session = await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [branchId],
	});
	try {
		const result = await applyMovement({
			variantId,
			branchId,
			op: { mode: "delta", deltaQty: -quantity },
			reason,
			reasonNote: note ?? null,
			supplierId: null,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export async function adjustStock(
	input: StockRecountInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const parsed = stockRecountSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}
	const { variantId, branchId, newQty, note } = parsed.data;
	const session = await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [branchId],
	});
	try {
		const result = await applyMovement({
			variantId,
			branchId,
			op: { mode: "target", newQty },
			reason: "ajuste_inventario",
			reasonNote: note ?? null,
			supplierId: null,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export async function updateStockThresholds(
	input: StockThresholdInput
): Promise<ActionResult> {
	const parsed = stockThresholdSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return {
			ok: false,
			error: firstIssue?.message ?? "Entrada inválida",
		};
	}

	const { variantId, branchId, minQty, reorderPoint } = parsed.data;

	await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [branchId],
	});

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

// ─── Tipos de leitura ─────────────────────────────────────────────────────────

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
	supplierId: string | null;
	supplierName: string | null;
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
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
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
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
		})
		.from(stockMovement)
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
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

	const cursorClause = movementKeysetCondition(cursor);
	if (cursorClause) {
		conditions.push(cursorClause);
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
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
		})
		.from(stockMovement)
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const nextCursor = encodeMovementCursor(items.at(-1), hasMore);

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
	supplierId: string | null;
	supplierName: string | null;
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
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
		.where(eq(toolVariant.toolId, toolId))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}

// Tool activity — cursor pagination + filters
// ---------------------------------------------------------------------------

export interface ToolActivityFilters {
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[];
	toolId: string;
}

export async function fetchToolActivityPage(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	await requireCapability("stock.read");

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

	const cursorClause = movementKeysetCondition(cursor);
	if (cursorClause) {
		conditions.push(cursorClause);
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
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const nextCursor = encodeMovementCursor(items.at(-1), hasMore);

	return { items, nextCursor };
}
