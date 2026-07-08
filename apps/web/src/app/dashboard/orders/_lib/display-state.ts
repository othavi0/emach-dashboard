import type { FulfillmentState } from "../../separacao/_lib/picking-logic";
import type { OrderStatus } from "../status-meta";

// Badge único do card (spec 2026-07-08): dentro de `preparing` o sub-estado
// da separação é mais informativo que o status; fora dele, o status manda.
// Nunca dois badges de estado no mesmo card.
export function orderBadgeSource(
	status: OrderStatus,
	fulfillmentState: FulfillmentState | null | undefined
): "fulfillment" | "status" {
	return status === "preparing" && fulfillmentState ? "fulfillment" : "status";
}
