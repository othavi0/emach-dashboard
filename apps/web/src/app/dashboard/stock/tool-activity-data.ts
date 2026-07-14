import "server-only";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { supplier, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { getUserBranchScope, inScope } from "@/lib/branch-scope";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import type { STOCK_MOVEMENT_REASONS } from "./_components/stock-movement-schema";
import {
	computePeriodCutoff,
	encodeMovementCursor,
	movementKeysetCondition,
	type PeriodPreset,
} from "./_lib/movements-shared";

export type { PeriodPreset } from "./_lib/movements-shared";

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

export interface ToolActivityFilters {
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[];
	toolId: string;
}

export async function getToolActivity(
	toolId: string,
	limit = 100
): Promise<ToolActivityRow[]> {
	const session = await requireCapability("stock.read");
	const scope = await getUserBranchScope(session);

	// Inventory é filial-scoped (ADR-0016, decisão na #309): admin/user vê só
	// atividade das suas filiais; sem vínculo → vazio (fail-closed).
	if (scope.kind === "scoped" && scope.branchIds.length === 0) {
		return [];
	}
	const conditions = [eq(toolVariant.toolId, toolId)];
	if (scope.kind === "scoped") {
		conditions.push(inArray(stockMovement.branchId, scope.branchIds));
	}

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
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}

export async function fetchToolActivityPage(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	const session = await requireCapability("stock.read");
	const scope = await getUserBranchScope(session);

	if (scope.kind === "scoped" && scope.branchIds.length === 0) {
		return { items: [], nextCursor: null };
	}

	const conditions = [eq(toolVariant.toolId, filters.toolId)];

	if (filters.branchId) {
		// Valida a filial pedida contra o escopo mesmo no caminho direto por
		// Server Component (o wrapper "use server" também valida).
		if (!inScope(scope, filters.branchId)) {
			return { items: [], nextCursor: null };
		}
		conditions.push(eq(stockMovement.branchId, filters.branchId));
	} else if (scope.kind === "scoped") {
		// Sem filtro explícito: restringe ao escopo (decisão na #309).
		conditions.push(inArray(stockMovement.branchId, scope.branchIds));
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

	// TODO plan 045: migrar para paginate()
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const nextCursor = encodeMovementCursor(items.at(-1), hasMore);

	return { items, nextCursor };
}
