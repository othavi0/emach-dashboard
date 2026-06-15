// packages/db/scripts/seed/inventory.ts
import { stockLevel } from "@emach/db/schema/inventory";
import { stockMovement } from "@emach/db/schema/stock-movements";
import type { SeedContext, Tx } from "./context";
import { randInt } from "./random";

/**
 * Insere `stock_level` e o movimento de abertura (`entrada_compra`) para
 * TODAS as combinações (variantId, branchId) — toda variante em toda filial.
 *
 * Cada abertura recebe um `supplierId` (obrigatório em `entrada_compra` pelo
 * CHECK `entrada_requires_supplier`, ADR-0015), distribuído por (tool, filial):
 * assim toda ferramenta nasce com proveniência, as abas Estoque dos
 * fornecedores ficam populadas, e uma tool recebida em filiais diferentes
 * ganha mais de um fornecedor — demo da relação N:N derivada.
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
	const supplierIds = ctx.supplierIds;
	if (supplierIds.length === 0) {
		throw new Error(
			"supplierIds vazio — impossível setar supplierId nas entradas (ADR-0015)."
		);
	}

	let toolIdx = 0;
	for (const variantIds of Object.values(ctx.variantIdsByTool)) {
		for (const variantId of variantIds) {
			for (const [branchIdx, branchId] of ctx.branchIds.entries()) {
				const qtyAbertura = randInt(80, 250);
				const minQty = randInt(5, 15);
				const reorderPoint = randInt(minQty, 40);
				// Fornecedor por (tool, filial): varia por filial → uma tool em N
				// filiais nasce com N fornecedores (N:N derivado, ADR-0015).
				const supplierId =
					supplierIds[(toolIdx + branchIdx) % supplierIds.length];

				// 1. Movimento de abertura (entrada_compra exige fornecedor)
				await tx.insert(stockMovement).values({
					id: crypto.randomUUID(),
					variantId,
					branchId,
					previousQty: 0,
					newQty: qtyAbertura,
					delta: qtyAbertura,
					reason: "entrada_compra",
					reasonNote: null,
					supplierId,
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
		toolIdx++;
	}
}
