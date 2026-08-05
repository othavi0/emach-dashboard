import type { OrderStatus } from "@emach/db/schema/orders";

/**
 * Card Rastreio só existe pós-envio (spec D3): a operação posta no balcão e o
 * código chega depois. Estados de exceção (canceled/refunded/returned) não
 * rastreiam.
 */
export function showTrackingCard(status: OrderStatus): boolean {
	return status === "shipped" || status === "delivered";
}
