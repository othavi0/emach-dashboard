import { fetchKpis } from "../dashboard-data";
import { KpiCard } from "./kpi-card";

export async function KpiRow({ branchId }: { branchId: string | null }) {
	const k = await fetchKpis(branchId);
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			<KpiCard
				format="currency"
				label="Receita do dia"
				value={k.revenueToday}
			/>
			<KpiCard label="Pedidos ativos" value={k.activeOrders} />
			<KpiCard
				label="Reviews pendentes"
				sub={
					k.oldestPendingReviewHours == null
						? undefined
						: `mais antiga: ${k.oldestPendingReviewHours}h`
				}
				tone={k.pendingReviews > 0 ? "warning" : "default"}
				value={k.pendingReviews}
			/>
			<KpiCard
				label="Rupturas de estoque"
				tone={k.stockOutages > 0 ? "destructive" : "default"}
				value={k.stockOutages}
			/>
			<KpiCard label="Clientes ativos" value={k.activeClients} />
			<KpiCard
				label="Promoções ativas"
				sub={
					k.promotionsExpiring7d > 0
						? `+${k.promotionsExpiring7d} expirando 7d`
						: undefined
				}
				value={k.activePromotions}
			/>
		</div>
	);
}
