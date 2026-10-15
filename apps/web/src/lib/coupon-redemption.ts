import type { db } from "@emach/db";
import { promotion } from "@emach/db/schema/promotions";
import { eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Devolve a redenção que o checkout do ecommerce reservou para o cupom do
 * pedido. Roda na transação que grava `canceled`, sob o lock do pedido e
 * depois do re-check de status: como `canceled` é terminal, roda no máximo uma
 * vez por pedido. Contrato em docs/integration/admin-ecommerce.md.
 */
export async function releaseCouponRedemption(
	tx: Tx,
	couponId: string | null
): Promise<void> {
	if (!couponId) {
		return;
	}

	await tx
		.update(promotion)
		.set({
			redemptionCount: sql`GREATEST(${promotion.redemptionCount} - 1, 0)`,
		})
		.where(eq(promotion.id, couponId));
}
