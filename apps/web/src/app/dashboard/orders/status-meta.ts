export type { OrderStatus } from "@emach/db/schema/orders";

import type { OrderStatus as DbOrderStatus } from "@emach/db/schema/orders";
import type { StatusIconKey, Tone } from "@/components/status-visual";

// Tab default ao abrir /dashboard/orders (fila de entrada: pagos aguardando
// início da separação — startPicking transiciona paid→preparing sozinho).
export const DEFAULT_ORDER_TAB = "paid";

// Fluxo ativo do operador interno (grupo da esquerda na barra de tabs).
// Um chip por status do funil (spec 2026-07-08); a antiga aba agregada
// "A preparar" (paid+preparing) foi dividida em "Pago" e "Em preparação".
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

// Chaves antigas que ainda podem chegar por deep-link/bookmark. "to_prepare"
// era a aba agregada pago+preparando; cai na fila de entrada.
const LEGACY_TAB_ALIASES: Record<string, string> = {
	to_prepare: "paid",
};

export function canonicalOrderTabKey(tab?: string): string | undefined {
	if (!tab) {
		return tab;
	}
	return LEGACY_TAB_ALIASES[tab] ?? tab;
}

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

// Fonte única de status: label + ícone + cor. Consumida por badge, histórico e
// pendências. iconKey/tone são strings serializáveis (ver components/status-visual).
export const ORDER_STATUS_META: Record<
	DbOrderStatus,
	{ iconKey: StatusIconKey; label: string; tone: Tone }
> = {
	pending_payment: {
		label: "Aguardando pagamento",
		iconKey: "clock",
		tone: "warning",
	},
	payment_failed: {
		label: "Pagamento falhou",
		iconKey: "ban",
		tone: "destructive",
	},
	paid: { label: "Pago", iconKey: "check", tone: "success" },
	preparing: { label: "Em preparação", iconKey: "package", tone: "info" },
	shipped: { label: "Enviado", iconKey: "truck", tone: "info" },
	delivered: { label: "Entregue", iconKey: "checkCheck", tone: "success" },
	returned: { label: "Devolvido", iconKey: "undo", tone: "warning" },
	canceled: { label: "Cancelado", iconKey: "xCircle", tone: "destructive" },
	refunded: { label: "Reembolsado", iconKey: "rotate", tone: "destructive" },
};

export const ORDER_STATUS_LABELS: Record<DbOrderStatus, string> =
	Object.fromEntries(
		Object.entries(ORDER_STATUS_META).map(([status, meta]) => [
			status,
			meta.label,
		])
	) as Record<DbOrderStatus, string>;
