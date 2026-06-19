import "server-only";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";
import { order, orderItem } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getUserBranchScope, inScope } from "@/lib/branch-scope";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	computePeriodCutoff,
	encodeMovementCursor,
	movementKeysetCondition,
	type PeriodPreset,
} from "./_lib/movements-shared";

export type { PeriodPreset } from "./_lib/movements-shared";

export interface LedgerFilters {
	actorId?: string;
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[];
	supplierId?: string;
	toolId?: string;
}

export interface LedgerRow {
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
	toolId: string | null;
	toolName: string | null;
	variantSku: string | null;
}

export async function fetchLedgerPage(
	filters: LedgerFilters,
	cursor: string | null
): Promise<InfiniteResult<LedgerRow>> {
	const session = await requireCapability("stock.read");
	const scope = await getUserBranchScope(session);

	// Escopo cego: usuário sem filial atribuída, sem direito de ver triagem → vazio.
	if (scope.kind === "scoped" && scope.branchIds.length === 0) {
		return { items: [], nextCursor: null };
	}

	const conditions: ReturnType<typeof eq>[] = [];

	if (filters.toolId) {
		conditions.push(eq(toolVariant.toolId, filters.toolId));
	}
	if (filters.branchId) {
		// LEITURA: validar que a filial pedida está no escopo (senão um user de A
		// leria o ledger de B via ?branchId=<id-de-B>).
		if (!inScope(scope, filters.branchId)) {
			return { items: [], nextCursor: null };
		}
		conditions.push(eq(stockMovement.branchId, filters.branchId));
	} else if (scope.kind === "scoped") {
		// Sem filtro explícito: restringir ao escopo do usuário.
		conditions.push(inArray(stockMovement.branchId, scope.branchIds));
	}
	if (filters.supplierId) {
		conditions.push(eq(stockMovement.supplierId, filters.supplierId));
	}
	if (filters.actorId) {
		conditions.push(eq(stockMovement.actorId, filters.actorId));
	}
	if (filters.reasons && filters.reasons.length > 0) {
		conditions.push(
			inArray(
				stockMovement.reason,
				filters.reasons as (typeof stockMovement.reason._.data)[]
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
			delta: stockMovement.delta,
			previousQty: stockMovement.previousQty,
			newQty: stockMovement.newQty,
			reason: stockMovement.reason,
			reasonNote: stockMovement.reasonNote,
			toolId: tool.id,
			toolName: tool.name,
			variantSku: toolVariant.sku,
			branchId: stockMovement.branchId,
			branchName: branch.name,
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
			actorId: stockMovement.actorId,
			actorName: user.name,
		})
		.from(stockMovement)
		// leftJoin (não inner): o ledger é "histórico completo" — movimentos de
		// variantes deletadas (variantId → null) precisam aparecer mesmo sem tool.
		.leftJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(tool, eq(tool.id, toolVariant.toolId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const nextCursor = encodeMovementCursor(items.at(-1), hasMore);

	return { items, nextCursor };
}

// ─── Tipos de movimentação de estoque ─────────────────────────────────────────

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
	await requireCapability("stock.read");
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

	// TODO plan 045: migrar para paginate()
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
