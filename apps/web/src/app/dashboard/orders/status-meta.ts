export type { OrderStatus } from "@emach/db/schema/orders";

import type { OrderStatus as DbOrderStatus } from "@emach/db/schema/orders";

export const ORDER_TABS = [
	{
		key: "all",
		label: "Todos",
		statuses: null,
	},
	{
		key: "pending_payment",
		label: "Aguardando pgto",
		statuses: ["pending_payment"] as DbOrderStatus[],
	},
	{
		key: "paid",
		label: "Pagos",
		statuses: ["paid"] as DbOrderStatus[],
	},
	{
		key: "preparing",
		label: "Em preparação",
		statuses: ["preparing"] as DbOrderStatus[],
	},
	{
		key: "shipped",
		label: "Enviados",
		statuses: ["shipped"] as DbOrderStatus[],
	},
	{
		key: "delivered",
		label: "Entregues",
		statuses: ["delivered"] as DbOrderStatus[],
	},
	{
		key: "canceled",
		label: "Cancelados",
		statuses: ["canceled", "refunded"] as DbOrderStatus[],
	},
] as const;

export const ORDER_STATUS_LABELS: Record<DbOrderStatus, string> = {
	pending_payment: "Aguardando pgto",
	paid: "Pago",
	preparing: "Em preparação",
	shipped: "Enviado",
	delivered: "Entregue",
	canceled: "Cancelado",
	refunded: "Reembolsado",
};
