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
	pending_payment: "Aguard. pagamento",
	paid: "Pago",
	preparing: "Preparando",
	shipped: "Enviado",
	delivered: "Entregue",
	canceled: "Cancelado",
	refunded: "Reembolsado",
	returned: "Devolvido",
};

const STATUS_DOT: Record<string, string> = {
	pending_payment: "bg-amber-400",
	paid: "bg-sky-400",
	preparing: "bg-blue-500",
	shipped: "bg-violet-500",
	delivered: "bg-emerald-500",
	canceled: "bg-muted-foreground/50",
	refunded: "bg-muted-foreground/50",
	returned: "bg-muted-foreground/50",
};

function OrderCard({ order }: { order: BranchOrderRow }) {
	const dotClass = STATUS_DOT[order.status] ?? "bg-muted-foreground/50";
	const label = STATUS_LABEL[order.status] ?? order.status;
	const amount = BRL.format(Number.parseFloat(order.totalAmount));
	const date = DT.format(order.createdAt);

	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/orders/${order.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted font-bold text-[13px] text-muted-foreground tabular-nums">
					#{order.number.length <= 4 ? order.number : order.number.slice(-4)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						Pedido #{order.number}
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs">{date}</p>
				</div>
				<span className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
					<span aria-hidden className={`size-1.5 rounded-full ${dotClass}`} />
					{label}
				</span>
			</div>

			<div className="flex items-center justify-end border-border border-t px-4 py-2.5">
				<span className="font-bold text-[18px] text-foreground tabular-nums">
					{amount}
				</span>
			</div>
		</Link>
	);
}

export function OrdersTab({ orders }: { orders: BranchOrderRow[] }) {
	if (orders.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<PackageOpen
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem pedidos</p>
				<p className="text-muted-foreground text-xs">
					Esta filial ainda não atendeu pedidos.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{orders.map((o) => (
				<OrderCard key={o.id} order={o} />
			))}
		</div>
	);
}
