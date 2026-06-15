import "server-only";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
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
	await requireCapability("stock.read");

	const conditions: ReturnType<typeof eq>[] = [];

	if (filters.toolId) {
		conditions.push(eq(toolVariant.toolId, filters.toolId));
	}
	if (filters.branchId) {
		conditions.push(eq(stockMovement.branchId, filters.branchId));
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
