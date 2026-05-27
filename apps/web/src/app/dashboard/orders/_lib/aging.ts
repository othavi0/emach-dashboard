import type { OrderStatus } from "@emach/db/schema/orders";

export type AgingLevel = "ok" | "warn" | "late";

export const AGING_THRESHOLDS_HOURS: Partial<
	Record<OrderStatus, { warn: number; late: number }>
> = {
	paid: { warn: 12, late: 24 },
	preparing: { warn: 24, late: 48 },
	shipped: { warn: 168, late: 336 },
};

export function getAgingLevel(
	status: OrderStatus,
	enteredAt: Date | null,
	now: Date = new Date()
): AgingLevel {
	const threshold = AGING_THRESHOLDS_HOURS[status];
	if (!(threshold && enteredAt)) {
		return "ok";
	}
	const elapsedHours = (now.getTime() - enteredAt.getTime()) / 3_600_000;
	if (elapsedHours >= threshold.late) {
		return "late";
	}
	if (elapsedHours >= threshold.warn) {
		return "warn";
	}
	return "ok";
}

export function formatAgingLabel(
	enteredAt: Date,
	now: Date = new Date()
): string {
	const minutes = Math.round((now.getTime() - enteredAt.getTime()) / 60_000);
	if (minutes < 60) {
		return `há ${minutes} min`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 48) {
		return `há ${hours} h`;
	}
	const days = Math.round(hours / 24);
	return `há ${days} d`;
}
