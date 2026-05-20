import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { PackageOpen } from "lucide-react";
import Link from "next/link";

import type { BranchOrderRow } from "../../data";

const DT = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
});
const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

const STATUS_LABEL: Record<string, string> = {
	pending_payment: "Aguardando pagamento",
	paid: "Pago",
	preparing: "Preparando",
	shipped: "Enviado",
	delivered: "Entregue",
	canceled: "Cancelado",
	refunded: "Reembolsado",
	returned: "Devolvido",
};

export function OrdersTab({ orders }: { orders: BranchOrderRow[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					Pedidos recentes ({orders.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				{orders.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<PackageOpen
							aria-hidden
							className="size-12 text-muted-foreground opacity-40"
						/>
						<p className="font-medium text-sm">Sem pedidos</p>
						<p className="text-muted-foreground text-xs">
							Esta filial ainda não atendeu pedidos.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{orders.map((o) => (
							<li
								className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
								key={o.id}
							>
								<div className="min-w-0">
									<Link
										className="truncate font-medium text-sm hover:underline"
										href={`/dashboard/orders/${o.id}`}
									>
										#{o.number}
									</Link>
									<p className="truncate text-muted-foreground text-xs">
										{STATUS_LABEL[o.status] ?? o.status} ·{" "}
										{DT.format(o.createdAt)}
									</p>
								</div>
								<span className="text-sm tabular-nums">
									{BRL.format(Number.parseFloat(o.totalAmount))}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
