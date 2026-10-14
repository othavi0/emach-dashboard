import type { ClientStatus, ClientType } from "@emach/db/schema/client";
import type { OrderStatus } from "@emach/db/schema/orders";

const WHITESPACE_RE = /\s+/;

export function getInitials(name: string): string {
	const parts = name.trim().split(WHITESPACE_RE);

	if (parts.length === 1) {
		return (parts[0]?.slice(0, 2) ?? "").toUpperCase();
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export const CLIENT_STATUS_CONFIG: Record<
	ClientStatus,
	{ label: string; variant: "secondary" | "destructive" | "success" }
> = {
	active: { label: "Ativo", variant: "success" },
	inactive: { label: "Inativo", variant: "secondary" },
	blocked: { label: "Bloqueado", variant: "destructive" },
};

export const CLIENT_TYPE_CONFIG: Record<
	ClientType,
	{ label: string; variant: "info" | "warning" }
> = {
	b2c: { label: "Pessoa Física (B2C)", variant: "info" },
	b2b: { label: "Pessoa Jurídica (B2B)", variant: "warning" },
};

// Partial de propósito: payment_failed e returned caem no fallback do caller
// (o próprio status), comportamento herdado. Completar o mapa muda o texto visível.
export const ORDER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
	pending_payment: "Aguardando pagamento",
	paid: "Pago",
	preparing: "Preparando",
	shipped: "Enviado",
	delivered: "Entregue",
	canceled: "Cancelado",
	refunded: "Reembolsado",
};

export const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

export const COUNT = new Intl.NumberFormat("pt-BR");
