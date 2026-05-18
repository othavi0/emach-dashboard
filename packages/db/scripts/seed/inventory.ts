// packages/db/scripts/seed/inventory.ts
import { stockLevel } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import type { SeedContext, Tx } from "./context";
import { randInt } from "./random";

/**
 * Insere `stock_level` e o movimento de abertura (`entrada_compra`) para
 * TODAS as combinações (variantId, branchId) — toda variante em toda filial.
 *
 * Quantidade de abertura generosa (80–250 unidades) para cobrir as vendas
 * geradas por `sales.ts`, garantindo que qualquer order_item de order pago
 * sempre encontre stock_level para debitar (sem fallback que pule o débito).
 *
 * Invariante de coerência garantida em insert:
 *   stock_level.quantity == SUM(stock_movement.delta) WHERE variantId + branchId
 */
export async function seedInventory(tx: Tx, ctx: SeedContext): Promise<void> {
	const actorId = ctx.staffUserIds[0];
	if (!actorId) {
		throw new Error(
			"staffUserIds vazio — impossível setar actorId nos movimentos."
		);
	}

	for (const [_toolId, variantIds] of Object.entries(ctx.variantIdsByTool)) {
		for (const variantId of variantIds) {
			// Criar stock_level em TODAS as filiais (sem seleção aleatória)
			for (const branchId of ctx.branchIds) {
				const qtyAbertura = randInt(80, 250);
				const minQty = randInt(5, 15);
				const reorderPoint = randInt(minQty, 40);

				// 1. Movimento de abertura
				await tx.insert(stockMovement).values({
					id: crypto.randomUUID(),
					variantId,
					branchId,
					previousQty: 0,
					newQty: qtyAbertura,
					delta: qtyAbertura,
					reason: "entrada_compra",
					reasonNote: null,
					orderId: null,
					orderItemId: null,
					actorType: "user",
					actorId,
				});

				// 2. Stock level (snapshot = soma dos movimentos)
				await tx.insert(stockLevel).values({
					variantId,
					branchId,
					quantity: qtyAbertura,
					minQty,
					reorderPoint,
				});
			}
		}
	}
}
