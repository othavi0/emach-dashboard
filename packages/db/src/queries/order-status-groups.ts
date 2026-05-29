import { type SQL, sql } from "drizzle-orm";
import type { orderStatusEnum } from "../schema/orders";

type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/** Pedidos que contam como receita / LTV (pago em diante, até entregue). */
export const REVENUE_ORDER_STATUSES = [
	"paid",
	"preparing",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];

/** Pedidos ativos em processamento (pago, ainda não entregue). */
export const ACTIVE_ORDER_STATUSES = [
	"paid",
	"preparing",
	"shipped",
] as const satisfies readonly OrderStatus[];

/** Pedidos em aberto, incluindo aguardando pagamento (não-terminais). */
export const OPEN_ORDER_STATUSES = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
] as const satisfies readonly OrderStatus[];

/**
 * Fragmento SQL para a lista de um `<coluna> IN (...)` em `db.execute` raw.
 * Parametriza cada valor (vira `$1, $2, ...`) — mesmo resultado dos literais.
 */
export function sqlStatusList(statuses: readonly OrderStatus[]): SQL {
	return sql.join(
		statuses.map((s) => sql`${s}`),
		sql`, `
	);
}
