import type { FulfillmentState } from "../../separacao/_lib/picking-logic";
import type { OrderStatus } from "../status-meta";

// Badge único do card (spec 2026-07-08): dentro de `preparing` o sub-estado
// da separação é mais informativo que o status; fora dele, o status manda.
// Nunca dois badges de estado no mesmo card.
// Exceção consciente (spec 2026-07-13): na aba Atrasados a pergunta é "em
// que etapa travou?" — o card mostra o status real; o sub-estado de picking
// vive na página Separação.
export function orderBadgeSource(
	status: OrderStatus,
	fulfillmentState: FulfillmentState | null | undefined,
	tabKey?: string
): "fulfillment" | "status" {
	if (tabKey === "late") {
		return "status";
	}
	return status === "preparing" && fulfillmentState ? "fulfillment" : "status";
}
