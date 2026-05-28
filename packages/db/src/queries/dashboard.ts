/** Ordem canônica do ciclo de vida (não a ordem de ADD VALUE do enum). */
export const ORDER_STATUS_FUNNEL = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
	"payment_failed",
	"returned",
] as const;

export function sortByFunnel<T extends { status: string }>(rows: T[]): T[] {
	const pos = (s: string) => {
		const i = ORDER_STATUS_FUNNEL.indexOf(
			s as (typeof ORDER_STATUS_FUNNEL)[number]
		);
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	return [...rows].sort((a, b) => pos(a.status) - pos(b.status));
}

/** Média móvel trailing (janela cresce até `window`). */
export function movingAverage(values: number[], window: number): number[] {
	return values.map((_, i) => {
		const start = Math.max(0, i - window + 1);
		const slice = values.slice(start, i + 1);
		return slice.reduce((a, b) => a + b, 0) / slice.length;
	});
}
