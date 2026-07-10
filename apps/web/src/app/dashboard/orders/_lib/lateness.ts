import type { OrderStatus } from "@emach/db/schema/orders";

// Regra aprovada na spec 2026-07-10: relógio = paid_at (fallback created_at).
export const LATE_AMBER_HOURS = 48;
export const LATE_TAB_HOURS = 72;

const FULFILLMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
	"paid",
	"preparing",
]);

export type Lateness = "none" | "amber" | "late";

export function latenessOf(
	status: OrderStatus,
	paidAt: Date | null,
	createdAt: Date,
	now: Date
): Lateness {
	if (!FULFILLMENT_STATUSES.has(status)) {
		return "none";
	}
	const base = paidAt ?? createdAt;
	const ageHours = (now.getTime() - base.getTime()) / 3_600_000;
	if (ageHours >= LATE_TAB_HOURS) {
		return "late";
	}
	if (ageHours >= LATE_AMBER_HOURS) {
		return "amber";
	}
	return "none";
}
