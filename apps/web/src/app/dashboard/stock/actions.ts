"use server";

import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import type { StockMovementReason } from "@emach/db/schema/stock-movements";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { toolVariant } from "@emach/db/schema/tools";
import { and, eq } from "drizzle-orm";

import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import type { InfiniteResult } from "@/lib/infinite";

import {
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import {
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
	fetchBranchStockPage as _fetchBranchStockPage,
	type BranchStockFiltersInput,
	type BranchStockRow,
} from "./branch-stock-data";
import {
	fetchVariantBranchMovementsPage as _fetchVariantBranchMovementsPage,
	getReservedQtyByVariantBranch as _getReservedQtyByVariantBranch,
	type StockMovementRow,
} from "./movements-data";
import {
	fetchToolActivityPage as _fetchToolActivityPage,
	type ToolActivityFilters,
	type ToolActivityRow,
} from "./tool-activity-data";

export type { PeriodPreset } from "./_lib/movements-shared";
export type { StockMovementRow } from "./movements-data";
export type {
	ToolActivityFilters,
	ToolActivityRow,
} from "./tool-activity-data";

interface AdjustStockSuccess {
	delta: number;
	movementId: string | null;
	newQty: number;
	previousQty: number;
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
		return { ok: false, error: actionErrorMessage(error) };
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
		return { ok: false, error: actionErrorMessage(error) };
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
		return { ok: false, error: actionErrorMessage(error) };
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
		return { ok: false, error: actionErrorMessage(error) };
	}
}

// ─── Wrappers de leitura para Client Components ───────────────────────────────
// Estas funções são "use server" endpoints que delegam à camada data (server-only).
// Client Components chamam estas; Server Components importam direto de movements-data
// ou tool-activity-data.

export async function fetchVariantBranchMovementsPageAction(
	variantId: string,
	branchId: string,
	cursor: string | null
): Promise<InfiniteResult<StockMovementRow>> {
	await requireCapabilityWithContext("stock.read", {
		targetBranchIds: [branchId],
	});
	return await _fetchVariantBranchMovementsPage(variantId, branchId, cursor);
}

export async function getReservedQtyByVariantBranchAction(
	variantId: string,
	branchId: string
): Promise<number> {
	await requireCapabilityWithContext("stock.read", {
		targetBranchIds: [branchId],
	});
	return await _getReservedQtyByVariantBranch(variantId, branchId);
}

export async function fetchToolActivityPageAction(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	if (filters.branchId) {
		await requireCapabilityWithContext("stock.read", {
			targetBranchIds: [filters.branchId],
		});
	} else {
		await requireCapability("stock.read");
	}
	return await _fetchToolActivityPage(filters, cursor);
}

export async function fetchBranchStockPageAction(args: {
	filters: BranchStockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchStockRow>> {
	// A camada data (fetchBranchStockPage) já valida branch-scope (fail-closed,
	// retorna vazio fora do escopo); aqui só falta a capability no boundary.
	await requireCapability("stock.read");
	return await _fetchBranchStockPage(args);
}
