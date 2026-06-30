import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";
import { cn } from "@emach/ui/lib/utils";
import { kpiGridClass } from "../_lib/kpi-grid";
import { fetchDashboardSummary } from "../dashboard-data";
import { KpiCard } from "./kpi-card";

export async function KpiRow({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const s = await fetchDashboardSummary(branchId, period);
	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			<KpiCard
				delta={s.revenueDelta}
				format="currency"
				label="Receita"
				value={s.revenue}
			/>
			<KpiCard label="Pedidos ativos" value={s.activeOrders} />
			<KpiCard
				label="Rupturas de estoque"
				tone={s.stockOutages > 0 ? "destructive" : "default"}
				value={s.stockOutages}
			/>
			<KpiCard
				delta={s.ticketDelta}
				format="currency"
				label="Ticket médio"
				value={s.ticket}
			/>
		</div>
	);
}
