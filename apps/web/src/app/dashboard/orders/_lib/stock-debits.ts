import type { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { orderItem } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq, gte, sql } from "drizzle-orm";

type StockDebitTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const BRANCH_LOCKED_BY_DEBIT =
	"O estoque deste pedido já saiu da filial atual quando ele foi pago. A filial não pode mais ser trocada.";

export const BRANCH_LOCKED_SKIP_LABEL = "estoque já saiu da filial atual";

/**
 * Pedido com saida_venda tem o estoque baixado na filial dele: trocar a filial
 * depois deixaria o débito numa filial e o pedido em outra (#443). Mesma filial
 * não é troca e passa.
 */
export async function isBranchChangeBlocked(
	tx: StockDebitTx,
	{ orderId, from, to }: { from: string | null; orderId: string; to: string }
): Promise<boolean> {
	if (from === to) {
		return false;
	}

	const [debit] = await tx
		.select({ id: stockMovement.id })
		.from(stockMovement)
		.where(
			and(
				eq(stockMovement.orderId, orderId),
				eq(stockMovement.reason, "saida_venda")
			)
		)
		.limit(1);

	return debit !== undefined;
}

interface SaleDebitInput {
	actorId: string;
	/** Filial do pedido travado; nulo é pedido na triagem, que não debita. */
	branchId: string | null;
	orderId: string;
}

/**
 * Debita da filial do pedido a quantidade de cada order_item e grava um
 * stock_movement 'saida_venda' por item (ADR-0007). Roda na transação do
 * status; um erro desfaz tudo. Idempotente pelo índice parcial
 * stock_movement_sale_idempotency: item que já tem saida_venda não debita de
 * novo. Itens em ordem de variante para travar stock_level sempre na mesma
 * ordem entre transações concorrentes.
 */
export async function applySaleDebits(
	tx: StockDebitTx,
	{ actorId, branchId, orderId }: SaleDebitInput
): Promise<void> {
	if (!branchId) {
		throw new Error("Atribua uma filial ao pedido antes de marcar como pago");
	}

	const items = await tx
		.select({
			id: orderItem.id,
			variantId: orderItem.variantId,
			quantity: orderItem.quantity,
			name: orderItem.name,
			sku: orderItem.sku,
		})
		.from(orderItem)
		.where(eq(orderItem.orderId, orderId))
		.orderBy(orderItem.variantId, orderItem.id);

	for (const item of items) {
		const levelOfItem = and(
			eq(stockLevel.variantId, item.variantId),
			eq(stockLevel.branchId, branchId)
		);

		const [level] = await tx
			.select({ quantity: stockLevel.quantity })
			.from(stockLevel)
			.where(levelOfItem)
			.for("update");

		const previousQty = level?.quantity ?? 0;

		const inserted = await tx
			.insert(stockMovement)
			.values({
				id: crypto.randomUUID(),
				variantId: item.variantId,
				branchId,
				previousQty,
				newQty: previousQty - item.quantity,
				delta: -item.quantity,
				reason: "saida_venda",
				reasonNote: "Pedido marcado como pago",
				orderId,
				orderItemId: item.id,
				actorType: "user",
				actorId,
			})
			.onConflictDoNothing({
				target: stockMovement.orderItemId,
				where: sql`reason = 'saida_venda' AND order_item_id IS NOT NULL`,
			})
			.returning({ id: stockMovement.id });

		if (inserted.length === 0) {
			continue;
		}

		const debited = await tx
			.update(stockLevel)
			.set({
				quantity: sql`${stockLevel.quantity} - ${item.quantity}`,
				updatedAt: new Date(),
			})
			.where(and(levelOfItem, gte(stockLevel.quantity, item.quantity)))
			.returning({ quantity: stockLevel.quantity });

		if (debited.length === 0) {
			const label = item.sku ? `${item.name} (SKU ${item.sku})` : item.name;

			throw new Error(
				`Estoque insuficiente de ${label} na filial do pedido: ${previousQty} disponível, o pedido pede ${item.quantity}`
			);
		}
	}
}
