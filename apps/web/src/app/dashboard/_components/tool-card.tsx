import { Badge } from "@emach/ui/components/badge";
import Link from "next/link";

import {
	TOOL_STATUS_LABELS,
	type ToolStatusValue,
} from "@/app/dashboard/tools/_components/tool-schema";

const STATUS_BADGE_VARIANT: Record<
	ToolStatusValue,
	"destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
};

export interface ToolCardData {
	cartAdds30d: number;
	id: string;
	imageUrl: string | null;
	name: string;
	primaryCategoryName: string | null;
	sku: string | null;
	status: ToolStatusValue;
	totalStock: number;
	variantCount: number;
	variantSummaries: string[];
}

interface ToolCardProps {
	tool: ToolCardData;
}

function formatMeta(tool: ToolCardData): string {
	const parts: string[] = [];
	if (tool.sku) {
		parts.push(`SKU ${tool.sku}`);
	}
	const voltages = tool.variantSummaries.filter((v) => v.trim().length > 0);
	if (voltages.length > 0) {
		parts.push(voltages.join("/"));
	}
	return parts.join(" · ") || "—";
}

export function ToolCard({ tool }: ToolCardProps) {
	const stockIsCritical = tool.totalStock === 0;
	const isDimmed = tool.status === "draft" || tool.status === "discontinued";

	return (
		<Link
			className={`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
				isDimmed ? "opacity-70" : ""
			}`}
			href={`/dashboard/tools/${tool.id}`}
		>
			{/* Imagem com badges sobrepostos */}
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
				{tool.primaryCategoryName && (
					<div className="absolute bottom-2 left-2">
						<Badge
							className="text-[10px] shadow-sm backdrop-blur-sm"
							variant="secondary"
						>
							{tool.primaryCategoryName}
						</Badge>
					</div>
				)}
				<div className="absolute top-2 right-2">
					{tool.status === "active" && stockIsCritical ? (
						<Badge className="shadow-sm backdrop-blur-sm" variant="destructive">
							Esgotado
						</Badge>
					) : (
						<Badge
							className="shadow-sm backdrop-blur-sm"
							variant={STATUS_BADGE_VARIANT[tool.status] ?? "outline"}
						>
							{TOOL_STATUS_LABELS[tool.status] ?? tool.status}
						</Badge>
					)}
				</div>
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-1 px-4 pt-3 pb-3">
				<span className="line-clamp-2 font-semibold text-[15px] text-foreground leading-[1.3] tracking-tight">
					{tool.name}
				</span>
				<p className="line-clamp-1 text-muted-foreground text-xs">
					{formatMeta(tool)}
				</p>
			</div>

			{/* Footer de 3 métricas (espelha o card de estoque de filial) */}
			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${
							stockIsCritical ? "text-destructive" : "text-primary"
						}`}
					>
						{tool.totalStock}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Estoque
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{tool.variantCount}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Variantes
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-primary tabular-nums">
						{tool.cartAdds30d}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Carrinho 30d
					</span>
				</div>
			</div>
		</Link>
	);
}
