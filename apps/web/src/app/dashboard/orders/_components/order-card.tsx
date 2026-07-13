import { Badge } from "@emach/ui/components/badge";
import { cn } from "@emach/ui/lib/utils";
import { MapPinIcon, PackageIcon, TruckIcon } from "lucide-react";
import Link from "next/link";

import { STATUS_BADGE_CAPS } from "@/components/status-visual";
import { FULFILLMENT_STATE_META } from "../../separacao/fulfillment-meta";
import { ageMetaForTab } from "../_lib/age-meta";
import { orderBadgeSource } from "../_lib/display-state";
import { latenessOf } from "../_lib/lateness";
import type { OrderListItem } from "../data";
import { OrderStatusBadge } from "./order-status-badge";
import { ShippingUnverifiedBadge } from "./shipping-unverified-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 0,
	style: "currency",
});

export function OrderCard({
	item,
	tabKey,
	highlightToolId,
}: {
	highlightToolId?: string | null;
	item: OrderListItem;
	tabKey: string;
}) {
	const lateness = latenessOf(
		item.status,
		item.paidAt,
		item.createdAt,
		new Date()
	);
	const age = ageMetaForTab(tabKey, item);
	const hiddenItems = item.itemsCount - item.items.length;

	return (
		<Link
			className={cn(
				"group flex h-full flex-col overflow-hidden rounded-[10px] border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				lateness === "none"
					? "border-border hover:border-border/60"
					: "border-warning/40 hover:border-warning/60"
			)}
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
				<div className="flex flex-shrink-0 flex-col items-end gap-3">
					<div className="flex items-center gap-1.5">
						{/* Chip de atraso: flag temporal, não segundo badge de estado
						    (spec 2026-07-13). Omitido na aba Atrasados — lá todos estão. */}
						{lateness === "late" && tabKey !== "late" && (
							<Badge
								className={cn(
									STATUS_BADGE_CAPS,
									"bg-warning text-warning-foreground"
								)}
							>
								Atrasado
							</Badge>
						)}
						{orderBadgeSource(item.status, item.fulfillmentState, tabKey) ===
							"fulfillment" && item.fulfillmentState ? (
							<Badge
								className={STATUS_BADGE_CAPS}
								variant={
									FULFILLMENT_STATE_META[item.fulfillmentState].badgeVariant
								}
							>
								{FULFILLMENT_STATE_META[item.fulfillmentState].label}
							</Badge>
						) : (
							<OrderStatusBadge status={item.status} />
						)}
					</div>
					<span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
						<TruckIcon aria-hidden className="size-3" />
						<span className="uppercase">
							{item.shippingMethod ?? "A combinar"}
						</span>
					</span>
					{item.shippingUnverified && <ShippingUnverifiedBadge compact />}
				</div>
			</div>

			<div className="flex min-h-[84px] flex-col gap-1.5 border-border/55 border-t px-4 pt-2 pb-2.5">
				{item.items.map((line, index) => (
					<div
						className={cn(
							"flex items-center gap-2.5",
							highlightToolId === line.toolId &&
								"-mx-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 outline outline-1 outline-primary/35"
						)}
						// key posicional: lista curta ordenada de forma estável no SQL, sem inputs nem
						// reordenação; toolId+name colidem entre variantes da mesma ferramenta.
						key={`${line.toolId}-${index}`}
					>
						{line.imageUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							// biome-ignore lint/correctness/useImageSize: fixed size via Tailwind
							<img
								alt=""
								className="size-[30px] shrink-0 rounded-md border border-border bg-muted object-cover"
								src={line.imageUrl}
							/>
						) : (
							<span className="flex size-[30px] shrink-0 items-center justify-center rounded-md border border-border bg-muted">
								<PackageIcon
									aria-hidden
									className="size-4 text-muted-foreground"
								/>
							</span>
						)}
						<span
							className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90"
							title={line.name}
						>
							{line.name}
						</span>
						<span className="shrink-0 font-mono font-semibold text-[12px] tabular-nums">
							×{line.quantity}
						</span>
					</div>
				))}
				{hiddenItems > 0 && (
					<span className="pl-[40px] text-[11.5px] text-muted-foreground">
						+{hiddenItems} {hiddenItems === 1 ? "item" : "itens"}
					</span>
				)}
			</div>

			<div className="mt-auto grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{item.unitsCount}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Unidades
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{CURRENCY_FORMATTER.format(item.totalAmount)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span
						className={cn(
							"font-bold text-[13px] tabular-nums",
							lateness === "none" ? "text-foreground" : "text-warning"
						)}
					>
						{age.value}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						{age.label}
					</span>
				</div>
			</div>
		</Link>
	);
}
