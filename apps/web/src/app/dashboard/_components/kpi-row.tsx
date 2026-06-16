import { fetchKpis } from "../dashboard-data";
import { KpiCard } from "./kpi-card";

// Idade legível: horas até 1 dia, depois dias. "386h" lê pior que "16 dias".
function formatAge(hours: number): string {
	if (hours < 24) {
		return `${hours}h`;
	}
	const days = Math.round(hours / 24);
	return `${days} dia${days === 1 ? "" : "s"}`;
}

export async function KpiRow({ branchId }: { branchId: string | null }) {
	const k = await fetchKpis(branchId);
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
			<KpiCard label="Pedidos ativos" value={k.activeOrders} />
			<KpiCard
				label="Avaliações pendentes"
				sub={
					k.oldestPendingReviewHours == null
						? undefined
						: `mais antiga: ${formatAge(k.oldestPendingReviewHours)}`
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
