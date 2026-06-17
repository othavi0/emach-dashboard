import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";
import { type KpiCaps, kpiGridClass } from "../_lib/kpi-grid";
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

export async function KpiRow({
	branchId,
	caps,
}: {
	branchId: string | null;
	caps: KpiCaps;
}) {
	const k = await fetchKpis(branchId);
	const cards: ReactNode[] = [
		<KpiCard key="orders" label="Pedidos ativos" value={k.activeOrders} />,
	];
	if (caps.canReadReviews) {
		cards.push(
			<KpiCard
				key="reviews"
				label="Avaliações pendentes"
				sub={
					k.oldestPendingReviewHours == null
						? undefined
						: `mais antiga: ${formatAge(k.oldestPendingReviewHours)}`
				}
				tone={k.pendingReviews > 0 ? "warning" : "default"}
				value={k.pendingReviews}
			/>
		);
	}
	cards.push(
		<KpiCard
			key="stock"
			label="Rupturas de estoque"
			tone={k.stockOutages > 0 ? "destructive" : "default"}
			value={k.stockOutages}
		/>
	);
	if (caps.canReadCustomers) {
		cards.push(
			<KpiCard key="clients" label="Clientes ativos" value={k.activeClients} />
		);
	}
	if (caps.canReadPromotions) {
		cards.push(
			<KpiCard
				key="promotions"
				label="Promoções ativas"
				sub={
					k.promotionsExpiring7d > 0
						? `+${k.promotionsExpiring7d} expirando 7d`
						: undefined
				}
				value={k.activePromotions}
			/>
		);
	}

	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(cards.length))}>
			{cards}
		</div>
	);
}
