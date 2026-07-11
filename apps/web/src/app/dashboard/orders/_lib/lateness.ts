import type { OrderStatus } from "@emach/db/schema/orders";

// Regra aprovada na spec 2026-07-10: relógio = paid_at (fallback created_at).
export const LATE_AMBER_HOURS = 48;
export const LATE_TAB_HOURS = 72;

const FULFILLMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
	"paid",
	"preparing",
]);

export type Lateness = "none" | "amber" | "late";

// Regra spec 2026-07-11: cada etapa conta o próprio relógio — paid de
// paid_at; preparing de preparing_at (fallback paid_at p/ legado sem a
// coluna preenchida). Espelhada no SQL de orders-where.ts/data.ts.
export function latenessOf(args: {
	createdAt: Date;
	now: Date;
	paidAt: Date | null;
	preparingAt: Date | null;
	status: OrderStatus;
}): Lateness {
	if (!FULFILLMENT_STATUSES.has(args.status)) {
		return "none";
	}
	const base =
		args.status === "preparing"
			? (args.preparingAt ?? args.paidAt ?? args.createdAt)
			: (args.paidAt ?? args.createdAt);
	const ageHours = (args.now.getTime() - base.getTime()) / 3_600_000;
	if (ageHours >= LATE_TAB_HOURS) {
		return "late";
	}
	if (ageHours >= LATE_AMBER_HOURS) {
		return "amber";
	}
	return "none";
}
