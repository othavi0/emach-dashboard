"use client";

import {
	DASHBOARD_PERIODS,
	type DashboardPeriod,
} from "@emach/db/queries/dashboard-period";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import { usePathname } from "next/navigation";
import { useFilterState } from "@/lib/use-filter-state";

const LABELS: Record<DashboardPeriod, string> = {
	"7d": "7 dias",
	"30d": "30 dias",
	"90d": "90 dias",
	"12m": "12 meses",
};

export function PeriodFilter({ value }: { value: DashboardPeriod }) {
	const pathname = usePathname();
	const { setParam } = useFilterState({ basePath: pathname });

	return (
		<Tabs
			onValueChange={(next) => setParam("period", next === "30d" ? null : next)}
			value={value}
		>
			<TabsList>
				{DASHBOARD_PERIODS.map((p) => (
					<TabsTrigger key={p} value={p}>
						{LABELS[p]}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
