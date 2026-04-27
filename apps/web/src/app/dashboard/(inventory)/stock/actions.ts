"use server";

import { db } from "@emach/db";
import { user } from "@emach/db/schema/auth";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/permissions";
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

	const { toolId, branchId, newQty, reason, reasonNote } = parsed.data;
	const actorId = session.user.id;

	try {
		const result = await db.transaction(async (tx) => {
			// Step 1: Materialize row with quantity 0 if missing.
			await tx
				.insert(stockLevel)
				.values({
					toolId,
					branchId,
					quantity: 0,
					updatedAt: new Date(),
				})
				.onConflictDoNothing({
					target: [stockLevel.toolId, stockLevel.branchId],
				});

			// Step 2: Lock the row.
			const lockedRows = await tx
				.select({ quantity: stockLevel.quantity })
				.from(stockLevel)
				.where(
					and(eq(stockLevel.toolId, toolId), eq(stockLevel.branchId, branchId))
				)
				.for("update");

			const previousQty = lockedRows[0]?.quantity ?? 0;
			const delta = newQty - previousQty;

			// No-op when nothing changed: stockMovement.delta_non_zero rejeitaria.
			if (delta === 0) {
				return { previousQty, delta, movementId: null as string | null };
			}

			// Step 3: Update quantity.
			await tx
				.update(stockLevel)
				.set({ quantity: newQty, updatedAt: new Date() })
				.where(
					and(eq(stockLevel.toolId, toolId), eq(stockLevel.branchId, branchId))
				);

			// Step 4: Insert movement row with actor audit.
			const movementId = crypto.randomUUID();
			await tx.insert(stockMovement).values({
				id: movementId,
				toolId,
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

		revalidatePath("/dashboard/stock");
		revalidatePath("/dashboard/stock/branches");
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		revalidatePath(`/dashboard/tools/${toolId}/stock`);

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

	const { toolId, branchId, minQty, reorderPoint } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			await tx
				.insert(stockLevel)
				.values({
					toolId,
					branchId,
					quantity: 0,
					minQty,
					reorderPoint,
					updatedAt: new Date(),
				})
				.onConflictDoNothing({
					target: [stockLevel.toolId, stockLevel.branchId],
				});

			await tx
				.update(stockLevel)
				.set({ minQty, reorderPoint, updatedAt: new Date() })
				.where(
					and(eq(stockLevel.toolId, toolId), eq(stockLevel.branchId, branchId))
				);
		});

		revalidatePath("/dashboard/stock");
		revalidatePath("/dashboard/stock/branches");
		revalidatePath(`/dashboard/branches/${branchId}/stock`);
		revalidatePath(`/dashboard/tools/${toolId}/stock`);

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
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(eq(stockMovement.toolId, toolId))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}
