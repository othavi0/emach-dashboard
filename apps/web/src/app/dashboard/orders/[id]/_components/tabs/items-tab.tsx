import { Badge } from "@emach/ui/components/badge";
import { ArrowUpRight, Package } from "lucide-react";
import Link from "next/link";

import type { OrderDetail, OrderDetailItem } from "../../../data";
import { formatCurrency } from "../../_lib/format-address";

export function ItemsTab({ order }: { order: OrderDetail }) {
	return (
		<div className="flex flex-col gap-4">
			<p className="font-sans font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
				Itens do pedido
			</p>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{order.items.map((item) => (
					<ItemCard item={item} key={item.id} />
				))}
			</div>

			<OrderTotals order={order} />
		</div>
	);
}

function ItemCard({ item }: { item: OrderDetailItem }) {
	const meta = (
		[
			["manufacturer", item.manufacturerName],
			["model", item.model],
			["voltage", item.voltage],
		] as const
	).filter(([, value]) => value);

	return (
		<div className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm">
			{/* Imagem 16:9 + badges sobrepostos */}
			<div className="relative overflow-hidden">
				{item.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={item.name}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						decoding="async"
						loading="lazy"
						src={item.imageUrl}
					/>
				) : (
					<div className="flex aspect-[16/9] w-full items-center justify-center bg-muted/40">
						<Package aria-hidden className="size-7 text-muted-foreground/50" />
					</div>
				)}

				{/* Quantidade — sempre visível, ancora a identificação */}
				<span className="absolute top-2 left-2 rounded-md border border-white/15 bg-black/70 px-2 py-0.5 font-medium text-[12px] text-white tabular-nums backdrop-blur-sm">
					{item.quantity} un
				</span>

				{/* Desconto por linha — só quando existe */}
				{item.discountAmount > 0 && (
					<Badge
						className="absolute top-2 right-2 shadow-sm backdrop-blur-sm"
						variant="success"
					>
						− {formatCurrency.format(item.discountAmount)}
					</Badge>
				)}

				{/* Atalho para a ferramenta no catálogo (nav secundária, hover) */}
				<Link
					aria-label={`Abrir ${item.name} no catálogo`}
					className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-[7px] border border-border bg-muted/90 text-muted-foreground opacity-0 backdrop-blur-sm transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
					href={`/dashboard/tools/${item.toolId}`}
				>
					<ArrowUpRight aria-hidden className="size-4" />
				</Link>
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pt-3 pb-3">
				<span className="line-clamp-2 font-medium text-[15px] text-foreground leading-[1.3]">
					{item.name}
				</span>
				{meta.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{meta.map(([field, value]) => (
							<span
								className="rounded-[5px] border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
								key={field}
							>
								{value}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Footer edge-to-edge — Unitário · Total (Qtd já está na imagem) */}
			<div className="mt-auto grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold font-mono text-[15px] tabular-nums">
						{formatCurrency.format(item.unitPrice)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Unitário
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold font-mono text-[15px] text-primary tabular-nums">
						{formatCurrency.format(item.lineTotal)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
			</div>
		</div>
	);
}

function OrderTotals({ order }: { order: OrderDetail }) {
	return (
		<div className="overflow-hidden rounded-[10px] border border-border bg-card">
			<p className="px-4 py-2.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
				Totais do pedido
			</p>
			<div className="grid grid-cols-4 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] tabular-nums">
						{formatCurrency.format(order.subtotalAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Subtotal
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] text-success tabular-nums">
						{order.discountAmount > 0
							? `− ${formatCurrency.format(order.discountAmount)}`
							: formatCurrency.format(0)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Desconto
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] tabular-nums">
						{formatCurrency.format(order.shippingAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Frete
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[15px] text-primary tabular-nums">
						{formatCurrency.format(order.totalAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
			</div>
		</div>
	);
}
