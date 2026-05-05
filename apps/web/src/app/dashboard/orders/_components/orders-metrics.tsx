import { Card, CardContent, CardHeader } from "@emach/ui/components/card";

import type { OrdersMetrics } from "../data";
import { ORDER_STATUS_LABELS } from "../status-meta";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

const NUMBER = new Intl.NumberFormat("pt-BR");

interface OrdersMetricsCardsProps {
	metrics: OrdersMetrics;
}

export function OrdersMetricsCards({ metrics }: OrdersMetricsCardsProps) {
	const statusEntries = Object.entries(metrics.statusBreakdown) as [
		keyof typeof ORDER_STATUS_LABELS,
		number,
	][];
	const totalAcrossStatus = statusEntries.reduce((s, [, n]) => s + n, 0);

	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			<MetricCard
				label="Hoje"
				primary={NUMBER.format(metrics.todayCount)}
				secondary={CURRENCY.format(metrics.todayTotal)}
			/>
			<MetricCard
				label="Semana"
				primary={NUMBER.format(metrics.weekCount)}
				secondary={CURRENCY.format(metrics.weekTotal)}
			/>
			<MetricCard
				label="Ticket médio (30d)"
				primary={CURRENCY.format(metrics.avgTicket30d)}
				secondary="média por pedido"
			/>
			<Card>
				<CardHeader className="pb-2">
					<span className="text-muted-foreground text-xs uppercase tracking-wide">
						Distribuição por status
					</span>
				</CardHeader>
				<CardContent className="flex flex-col gap-1.5">
					{statusEntries.length === 0 || totalAcrossStatus === 0 ? (
						<span className="text-muted-foreground text-sm">Sem pedidos</span>
					) : (
						statusEntries
							.filter(([, n]) => n > 0)
							.map(([status, count]) => (
								<div
									className="flex items-center justify-between gap-2 text-sm"
									key={status}
								>
									<span className="text-muted-foreground">
										{ORDER_STATUS_LABELS[status]}
									</span>
									<span className="font-medium tabular-nums">
										{NUMBER.format(count)}
									</span>
								</div>
							))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

interface MetricCardProps {
	label: string;
	primary: string;
	secondary: string;
}

function MetricCard({ label, primary, secondary }: MetricCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<span className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</span>
			</CardHeader>
			<CardContent className="flex flex-col gap-1">
				<span className="font-medium font-serif text-2xl tabular-nums">
					{primary}
				</span>
				<span className="text-muted-foreground text-sm">{secondary}</span>
			</CardContent>
		</Card>
	);
}
