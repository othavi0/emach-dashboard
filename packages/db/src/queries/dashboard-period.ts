// Helper puro de período da visão geral. Vive em queries/ (superfície de sync
// ecommerce, ADR-0009) — sem imports de fora de queries/.

export type DashboardPeriod = "7d" | "30d" | "90d" | "12m";
export type PeriodBucket = "day" | "week" | "month";

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
	"7d",
	"30d",
	"90d",
	"12m",
];

export const DEFAULT_PERIOD: DashboardPeriod = "30d";

const PERIOD_CONFIG: Record<
	DashboardPeriod,
	{ days: number; bucket: PeriodBucket; maWindow: number }
> = {
	"7d": { days: 7, bucket: "day", maWindow: 7 },
	"30d": { days: 30, bucket: "day", maWindow: 7 },
	"90d": { days: 90, bucket: "week", maWindow: 4 },
	"12m": { days: 365, bucket: "month", maWindow: 3 },
};

export function periodToConfig(period: DashboardPeriod): {
	days: number;
	bucket: PeriodBucket;
	maWindow: number;
} {
	return PERIOD_CONFIG[period];
}

export function computeDeltaPct(
	current: number,
	previous: number
): number | null {
	if (previous === 0) {
		return null;
	}
	return Math.round(((current - previous) / previous) * 1000) / 10;
}
