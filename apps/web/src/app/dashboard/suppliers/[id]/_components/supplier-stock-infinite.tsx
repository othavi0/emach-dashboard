"use client";

import Link from "next/link";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchSupplierStockPage } from "../../actions";
import type { SupplierStockToolRow } from "../../data";

interface Props {
	initial: SupplierStockToolRow[];
	initialCursor: string | null;
	search?: string;
	supplierId: string;
}

export function SupplierStockInfinite({
	supplierId,
	search,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchSupplierStockPage({ supplierId, search, cursor }),
		resetKey: search,
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((tool) => (
					<SupplierStockCard key={tool.id} tool={tool} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}

function SupplierStockCard({ tool }: { tool: SupplierStockToolRow }) {
	const initials = tool.name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();

	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/tools/${tool.id}/stock`}
		>
			{/* Thumb ou initials fallback */}
			<div className="relative overflow-hidden">
				{tool.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={tool.name}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						src={tool.imageUrl}
					/>
				) : (
					<div
						aria-hidden
						className="flex aspect-[16/9] w-full items-center justify-center bg-muted/40"
					>
						<span className="select-none font-semibold text-lg text-muted-foreground">
							{initials}
						</span>
					</div>
				)}
			</div>

			{/* Corpo: nome + SKU/categoria */}
			<div className="flex flex-col gap-1 px-4 pt-3 pb-3">
				<span className="line-clamp-2 block font-sans font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight">
					{tool.name}
				</span>
				<p className="line-clamp-1 text-muted-foreground text-xs">
					{tool.defaultSku
						? `SKU ${tool.defaultSku}`
						: (tool.category ?? tool.slug)}
				</p>
			</div>

			{/* Footer de 2 métricas: estoque geral + recebido */}
			<div className="grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[13px] text-foreground tabular-nums">
						{tool.generalStock}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Estoque geral
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[13px] text-foreground tabular-nums">
						{tool.receivedFromSupplier}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Recebidos
					</span>
				</div>
			</div>
		</Link>
	);
}
