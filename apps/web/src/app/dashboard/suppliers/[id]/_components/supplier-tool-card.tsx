import Link from "next/link";

import { ToolStatusBadge } from "@/components/tool-status-badge";
import type { SupplierToolRow } from "../../data";

const DATE = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function SupplierToolCard({ tool }: { tool: SupplierToolRow }) {
	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/tools/${tool.id}`}
		>
			{/* Imagem com badge de status absoluto */}
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
						className="aspect-[16/9] w-full border-dashed bg-muted/40"
					/>
				)}
				<div className="absolute top-2 right-2">
					<ToolStatusBadge
						className="shadow-sm backdrop-blur-sm"
						status={tool.status}
					/>
				</div>
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pt-3 pb-3">
				<div>
					<span className="line-clamp-2 block font-sans font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight">
						{tool.name}
					</span>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{tool.defaultSku ? `SKU ${tool.defaultSku}` : tool.slug}
					</p>
				</div>
			</div>

			{/* Footer de 2 métricas: categoria + data */}
			<div className="grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="line-clamp-1 font-bold text-[13px] text-foreground">
						{tool.category ?? "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Categoria
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[13px] text-foreground tabular-nums">
						{DATE.format(tool.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Criada em
					</span>
				</div>
			</div>
		</Link>
	);
}
