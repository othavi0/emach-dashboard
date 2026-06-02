export type { OrderStatus } from "@emach/db/schema/orders";

import type { OrderStatus as DbOrderStatus } from "@emach/db/schema/orders";

// Fluxo ativo do operador interno (grupo da esquerda na barra de tabs).
export const ORDER_FLOW_TABS = [
	{
		key: "paid",
		label: "Pago",
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
] as const;

// Estados fora do fluxo principal de ação (grupo da direita na barra de tabs).
export const ORDER_EXCEPTION_TABS = [
	{
		key: "pending_payment",
		label: "Aguardando pagamento",
		statuses: ["pending_payment", "payment_failed"] as DbOrderStatus[],
	},
	{
		key: "returned",
		label: "Devolvidos",
		statuses: ["returned"] as DbOrderStatus[],
	},
	{
		key: "canceled",
		label: "Cancelados",
		statuses: ["canceled", "refunded"] as DbOrderStatus[],
	},
] as const;

// Lista completa (sem "Todos") — consumida por data/export/KPIs.
export const ORDER_TABS = [...ORDER_FLOW_TABS, ...ORDER_EXCEPTION_TABS];

// Sentinel: nenhuma tab selecionada = todos os pedidos (sem filtro de status).
export const ALL_ORDERS_TAB = {
	key: "all",
	label: "Todos",
	statuses: null,
} as const;

export const ORDER_STATUS_LABELS: Record<DbOrderStatus, string> = {
	pending_payment: "Aguardando pgto",
	payment_failed: "Pagamento falhou",
	paid: "Pago",
	preparing: "Em preparação",
	shipped: "Enviado",
	delivered: "Entregue",
	returned: "Devolvido",
	canceled: "Cancelado",
	refunded: "Reembolsado",
};
