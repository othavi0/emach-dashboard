import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { OrderKpis } from "../data";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const PERCENT = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
});

const DELTA = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
	signDisplay: "always",
});

interface OrderKpisRowProps {
	kpis: OrderKpis;
}

export function OrderKpisRow({ kpis }: OrderKpisRowProps) {
	const deltaPercent =
		kpis.revenueYesterday > 0
			? ((kpis.revenueToday - kpis.revenueYesterday) / kpis.revenueYesterday) *
				100
			: null;

	const deltaClass =
		deltaPercent === null
			? "text-muted-foreground"
			: deltaPercent >= 0
				? "text-success"
				: "text-destructive";

	const deltaLabel =
		deltaPercent === null ? "—" : `${DELTA.format(deltaPercent)}% vs ontem`;

	return (
		<section className="grid gap-3 md:grid-cols-3">
			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Receita Hoje
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{CURRENCY.format(kpis.revenueToday)}
					</p>
					<p className={`text-xs ${deltaClass}`}>{deltaLabel}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Ticket Médio
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{CURRENCY.format(kpis.averageTicket)}
					</p>
					<p className="text-muted-foreground text-xs">últimos 30 dias</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						% Pagos
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{PERCENT.format(kpis.paidPercent)}%
					</p>
					<p className="text-muted-foreground text-xs">últimos 30 dias</p>
				</CardContent>
			</Card>
		</section>
	);
}
