import type { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { orderItem } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq } from "drizzle-orm";

export type StockReturnTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ReturnItemInput {
	branchId: string;
	orderItemId: string;
}

/**
 * Credita estoque de volta para itens de pedido devolvido/reembolsado.
 * Itera item a item: lê quantity, atualiza stock_level (upsert), insere
 * stock_movement com reason='devolucao_retorno' (ADR-0026 — separado de
 * ajuste_inventario, que é recontagem física). Idempotente: pula itens já
 * creditados (caminho returned → refunded). reasonNote diferencia retorno de
 * pedido vs reembolso direto.
 */
export async function applyStockReturns(
	tx: StockReturnTx,
	orderId: string,
	returnItems: ReturnItemInput[],
	userId: string,
	reasonNote: string
): Promise<void> {
	for (const item of returnItems) {
		const [oi] = await tx
			.select({
				quantity: orderItem.quantity,
				variantId: orderItem.variantId,
			})
			.from(orderItem)
			.where(
				and(eq(orderItem.id, item.orderItemId), eq(orderItem.orderId, orderId))
			);

		if (!oi) {
			continue;
		}

		// Idempotência (ADR-0026): se este order_item já foi creditado como
		// devolução, não credita de novo — cobre o caminho returned → refunded,
		// em que updateOrderStatus('returned') e refundOrder() chamam ambos esta
		// função sobre os mesmos itens. O índice parcial único
		// stock_movement_return_idempotency é a guarda final no banco.
		const [alreadyCredited] = await tx
			.select({ id: stockMovement.id })
			.from(stockMovement)
			.where(
				and(
					eq(stockMovement.orderItemId, item.orderItemId),
					eq(stockMovement.reason, "devolucao_retorno")
				)
			);
		if (alreadyCredited) {
			continue;
		}

		const [sl] = await tx
			.select({ quantity: stockLevel.quantity })
			.from(stockLevel)
			.where(
				and(
					eq(stockLevel.variantId, oi.variantId),
					eq(stockLevel.branchId, item.branchId)
				)
			)
			.for("update");

		const previousQty = sl?.quantity ?? 0;
		const newQty = previousQty + oi.quantity;

		await tx
			.insert(stockLevel)
			.values({
				variantId: oi.variantId,
				branchId: item.branchId,
				quantity: newQty,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [stockLevel.variantId, stockLevel.branchId],
				set: { quantity: newQty, updatedAt: new Date() },
			});

		await tx.insert(stockMovement).values({
			id: crypto.randomUUID(),
			variantId: oi.variantId,
			branchId: item.branchId,
			previousQty,
			newQty,
			delta: oi.quantity,
			reason: "devolucao_retorno",
			reasonNote,
			orderId,
			orderItemId: item.orderItemId,
			actorType: "user",
			actorId: userId,
		});
	}
}
