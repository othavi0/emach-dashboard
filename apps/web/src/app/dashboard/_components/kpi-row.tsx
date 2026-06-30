import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";
import { cn } from "@emach/ui/lib/utils";
import { kpiGridClass } from "../_lib/kpi-grid";
import { fetchDashboardSummary } from "../dashboard-data";
import { KpiCard } from "./kpi-card";
import { StaggerGrid, StaggerItem } from "./stagger";

export async function KpiRow({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const s = await fetchDashboardSummary(branchId, period);
	return (
		<StaggerGrid className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			<StaggerItem key="revenue">
				<KpiCard
					delta={s.revenueDelta}
					format="currency"
					label="Receita"
					value={s.revenue}
				/>
			</StaggerItem>
			<StaggerItem key="orders">
				<KpiCard label="Pedidos ativos" value={s.activeOrders} />
			</StaggerItem>
			<StaggerItem key="stock-outages">
				<KpiCard
					label="Rupturas de estoque"
					tone={s.stockOutages > 0 ? "destructive" : "default"}
					value={s.stockOutages}
				/>
			</StaggerItem>
			<StaggerItem key="ticket">
				<KpiCard
					delta={s.ticketDelta}
					format="currency"
					label="Ticket médio"
					value={s.ticket}
				/>
			</StaggerItem>
		</StaggerGrid>
	);
}
