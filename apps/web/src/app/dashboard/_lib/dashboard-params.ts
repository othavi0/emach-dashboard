import {
	DASHBOARD_PERIODS,
	type DashboardPeriod,
	DEFAULT_PERIOD,
} from "@emach/db/queries/dashboard-period";

export function parseBranchParam(
	value: string | string[] | undefined
): string | null {
	const v = Array.isArray(value) ? value[0] : value;
	if (!v || v === "all") {
		return null;
	}
	return v;
}

export function parsePeriodParam(
	value: string | string[] | undefined
): DashboardPeriod {
	const v = Array.isArray(value) ? value[0] : value;
	return DASHBOARD_PERIODS.includes(v as DashboardPeriod)
		? (v as DashboardPeriod)
		: DEFAULT_PERIOD;
}
