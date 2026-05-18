// packages/db/scripts/seed/inventory.ts
import { stockLevel } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import type { SeedContext, Tx } from "./context";

/** Inteiro aleatório em [min, max] (inclusivo). */
function randInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Insere `stock_level` e o movimento de abertura (`entrada_compra`) para cada
 * par (variantId, branchId) selecionado.
 *
 * Cada variante recebe estoque em 1–3 filiais escolhidas aleatoriamente de
 * `ctx.branchIds`. A quantidade de abertura é generosa (80–250 unidades) para
 * garantir que a Task 6 (`saida_venda`) nunca viole a check `quantity >= 0`.
 *
 * Invariante de coerência garantida em insert:
 *   stock_level.quantity  == SUM(stock_movement.delta) WHERE variantId + branchId
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
			// Escolher 1–3 filiais aleatórias (sem repetição)
			const branchCount = randInt(1, Math.min(3, ctx.branchIds.length));
			const shuffled = [...ctx.branchIds].sort(() => Math.random() - 0.5);
			const selectedBranches = shuffled.slice(0, branchCount);

			for (const branchId of selectedBranches) {
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
