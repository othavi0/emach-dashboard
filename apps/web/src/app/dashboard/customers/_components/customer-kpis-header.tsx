import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import { formatDate } from "@/lib/format/datetime";
import type { CustomerKpis } from "../data";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});
const COUNT = new Intl.NumberFormat("pt-BR");

const ORDER_STATUS_LABELS: Record<string, string> = {
	pending_payment: "Aguardando pagamento",
	paid: "Pago",
	preparing: "Preparando",
	shipped: "Enviado",
	delivered: "Entregue",
	canceled: "Cancelado",
	refunded: "Reembolsado",
};

interface CustomerKpisHeaderProps {
	kpis: CustomerKpis;
}

export function CustomerKpisHeader({ kpis }: CustomerKpisHeaderProps) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						LTV Total
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tracking-tight">
						{CURRENCY.format(kpis.ltv)}
					</p>
					<p className="text-muted-foreground text-xs">receita confirmada</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Pedidos
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tracking-tight">
						{COUNT.format(kpis.ordersCount)}
					</p>
					<p className="text-muted-foreground text-xs">total de pedidos</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Ticket Médio
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tracking-tight">
						{CURRENCY.format(kpis.averageTicket)}
					</p>
					<p className="text-muted-foreground text-xs">por pedido pago</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Último Pedido
					</CardTitle>
				</CardHeader>
				<CardContent>
					{kpis.lastOrderAt ? (
						<>
							<p className="font-medium text-2xl tracking-tight">
								{formatDate(kpis.lastOrderAt)}
							</p>
							{kpis.lastOrderStatus && (
								<p className="text-muted-foreground text-xs">
									{ORDER_STATUS_LABELS[kpis.lastOrderStatus] ??
										kpis.lastOrderStatus}
								</p>
							)}
						</>
					) : (
						<>
							<p className="font-medium text-2xl tracking-tight">—</p>
							<p className="text-muted-foreground text-xs">Sem pedidos</p>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
