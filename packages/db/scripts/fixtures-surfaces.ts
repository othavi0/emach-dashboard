import type { OrderStatus } from "@emach/db/schema/orders";

export const FIXTURE_SURFACES = [
	"order",
	"picking-exception",
	"banner",
	"review",
	"payment-failed",
	"canceled",
	"returned",
	"refunded",
	"ready-to-ship",
	"coupon",
] as const;

export type Surface = (typeof FIXTURE_SURFACES)[number];

export type OrderSurface = Exclude<Surface, "banner">;

// Transições que o pedido percorre a partir de pending_payment. Cada passo
// respeita VALID_TRANSITIONS de apps/web/src/app/dashboard/orders/schema.ts.
export const ORDER_STATUS_PATH = {
	order: ["paid"],
	"picking-exception": ["paid", "preparing"],
	review: ["paid", "preparing", "shipped", "delivered"],
	"payment-failed": ["payment_failed"],
	canceled: ["canceled"],
	returned: ["paid", "preparing", "shipped", "delivered", "returned"],
	refunded: ["paid", "refunded"],
	"ready-to-ship": ["paid", "preparing"],
	coupon: [],
} as const satisfies Record<OrderSurface, readonly OrderStatus[]>;

export function bornStatus(surface: OrderSurface): OrderStatus {
	return ORDER_STATUS_PATH[surface].at(-1) ?? "pending_payment";
}

const AGE_HOURS = /^[1-9]\d*$/;

export function parseAgeHours(raw: string): number {
	if (!AGE_HOURS.test(raw)) {
		throw new Error(
			`[fixtures] --age inválido: "${raw}" (esperado inteiro positivo de horas).`
		);
	}

	return Number(raw);
}
