import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { OrderStatusBadge } from "@/app/dashboard/orders/_components/order-status-badge";
import type { OrderStatus } from "@/app/dashboard/orders/status-meta";
import { formatDateTime } from "@/lib/format/datetime";

import type { BranchOrderRow } from "../../data";

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export function BranchOrderCard({ order }: { order: BranchOrderRow }) {
	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/orders/${order.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-[52px] flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-muted-foreground">
					<ShoppingCart aria-hidden className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
						{order.number}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{formatDateTime(order.createdAt)}
					</p>
				</div>
				<OrderStatusBadge status={order.status as OrderStatus} />
			</div>

			<div className="flex flex-col items-center border-border border-t py-2.5">
				<span className="font-bold text-[18px] text-foreground tabular-nums">
					{BRL.format(Number.parseFloat(order.totalAmount))}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Total
				</span>
			</div>
		</Link>
	);
}
