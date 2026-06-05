import { MapPinIcon } from "lucide-react";
import Link from "next/link";

import { getInitials } from "@/lib/format/name";
import type { OrderListItem } from "../data";
import { OrderStatusBadge } from "./order-status-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 0,
	style: "currency",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatCurrency(value: number) {
	return CURRENCY_FORMATTER.format(value);
}

function formatAbsoluteDate(value: Date) {
	return DATE_FORMATTER.format(value);
}

function formatRelativeDate(value: Date) {
	const diffMs = value.getTime() - Date.now();
	const diffMinutes = Math.round(diffMs / 60_000);

	if (Math.abs(diffMinutes) < 60) {
		return RELATIVE_FORMATTER.format(diffMinutes, "minute");
	}

	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return RELATIVE_FORMATTER.format(diffHours, "hour");
	}

	const diffDays = Math.round(diffHours / 24);
	return RELATIVE_FORMATTER.format(diffDays, "day");
}

export function OrderCard({ item }: { item: OrderListItem }) {
	return (
		<Link
			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/orders/${item.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted font-bold text-[17px] text-foreground">
					{getInitials(item.clientName)}
				</div>
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
				<OrderStatusBadge status={item.status} />
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
					<span className="font-bold text-[18px] text-primary tabular-nums">
						{formatCurrency(item.totalAmount)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span
						className="font-bold text-[13px] text-foreground tabular-nums"
						title={formatAbsoluteDate(item.createdAt)}
					>
						{formatRelativeDate(item.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Data
					</span>
				</div>
			</div>
		</Link>
	);
}
