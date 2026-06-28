import { MapPinIcon } from "lucide-react";
import Link from "next/link";

import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import type { OrderListItem } from "../data";
import { OrderStatusBadge } from "./order-status-badge";
import { ShippingUnverifiedBadge } from "./shipping-unverified-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 0,
	style: "currency",
});

function formatCurrency(value: number) {
	return CURRENCY_FORMATTER.format(value);
}

export function OrderCard({ item }: { item: OrderListItem }) {
	return (
		<Link
			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/orders/${item.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="min-w-0 flex-1">
					<span className="block truncate font-mono font-semibold text-[13px] text-foreground leading-tight tracking-tight">
						{item.number}
					</span>
					<p className="truncate text-[13px] text-foreground/90">
						{item.clientName}
					</p>
					<p className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground text-xs">
						<MapPinIcon aria-hidden className="size-3 shrink-0" />
						<span className="truncate">{item.branchName ?? "—"}</span>
					</p>
				</div>
				<div className="flex flex-shrink-0 flex-col items-end gap-1">
					<OrderStatusBadge status={item.status} />
					{item.shippingUnverified && <ShippingUnverifiedBadge compact />}
				</div>
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{item.itemsCount}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Itens
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{formatCurrency(item.totalAmount)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span
						className="font-bold text-[13px] text-foreground tabular-nums"
						title={formatDateTime(item.createdAt)}
					>
						{formatRelative(item.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Data
					</span>
				</div>
			</div>
		</Link>
	);
}
