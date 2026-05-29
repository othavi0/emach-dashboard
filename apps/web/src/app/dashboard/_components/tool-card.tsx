"use client";

import { Badge } from "@emach/ui/components/badge";
import { AlertTriangleIcon } from "lucide-react";
import { useRouter } from "next/navigation";

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

const MAX_VARIANT_CHIPS = 4;

export interface ToolCardBranchSummary {
	branchId: string;
	branchName: string;
	quantity: number;
}

export interface ToolCardData {
	branches: ToolCardBranchSummary[];
	id: string;
	imageUrl: string | null;
	name: string;
	primaryCategoryName: string | null;
	reorderCount: number;
	sku: string | null;
	slug: string | null;
	status: ToolStatusValue;
	supplierName: string | null;
	totalStock: number;
	variantCount: number;
	variantSummaries: string[];
	visibleOnSite: boolean;
	voltage: string | null;
}

export type ToolCardVariant = "catalog" | "stock-overview";

interface ToolCardProps {
	actions?: React.ReactNode;
	canMutate: boolean;
	tool: ToolCardData;
	variant: ToolCardVariant;
}

function formatMeta(tool: ToolCardData): string {
	const parts: string[] = [];
	if (tool.sku) {
		parts.push(`SKU ${tool.sku}`);
	}
	if (tool.voltage) {
		parts.push(tool.voltage);
	}
	if (tool.supplierName) {
		parts.push(tool.supplierName);
	}
	return parts.join(" · ");
}

export function ToolCard({ tool, variant, canMutate, actions }: ToolCardProps) {
	const router = useRouter();
	const showVariantsBlock =
		tool.variantCount > 1 && tool.variantSummaries.length > 0;
	const showReorderHeader =
		variant === "stock-overview" && tool.reorderCount > 0;
	const stockIsCritical = tool.totalStock === 0;

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/tools/${tool.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/tools/${tool.id}`);
				}
			}}
			role="button"
			tabIndex={0}
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
					) : showReorderHeader ? (
						<Badge className="shadow-sm backdrop-blur-sm" variant="warning">
							<AlertTriangleIcon aria-hidden className="size-3" />
							Repor{tool.reorderCount > 1 ? ` (${tool.reorderCount})` : ""}
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
			<div className="flex flex-col gap-2 px-4 pt-3 pb-4">
				{/* Nome + meta */}
				<div className="flex flex-col gap-1">
					<span className="line-clamp-2 font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight">
						{tool.name}
					</span>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{formatMeta(tool) || "—"}
					</p>
					{variant === "catalog" && (
						<div className="mt-0.5 flex items-center gap-1.5">
							<span
								className={`size-[5px] flex-shrink-0 rounded-full ${
									tool.visibleOnSite
										? "bg-green-500/60"
										: "bg-muted-foreground/30"
								}`}
							/>
							<p className="text-[10px] text-muted-foreground">
								{tool.visibleOnSite ? "Visível no site" : "Oculto no site"}
							</p>
						</div>
					)}
				</div>

				{/* Slot de variantes — sempre presente para altura uniforme */}
				<div className="flex min-h-[20px] flex-wrap gap-1">
					{showVariantsBlock && (
						<>
							{tool.variantSummaries.slice(0, MAX_VARIANT_CHIPS).map((v) => (
								<span
									className="rounded border border-border/50 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
									key={v}
									title={v}
								>
									{v}
								</span>
							))}
							{tool.variantSummaries.length > MAX_VARIANT_CHIPS && (
								<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
									+{tool.variantSummaries.length - MAX_VARIANT_CHIPS}
								</span>
							)}
						</>
					)}
				</div>

				<hr className="border-border" />

				{/* Rodapé */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-baseline gap-1">
						<span className="text-muted-foreground text-xs">Estoque:</span>
						<span
							className={`font-semibold text-[15px] tabular-nums leading-none ${
								stockIsCritical ? "text-destructive" : "text-primary"
							}`}
						>
							{tool.totalStock}
						</span>
					</div>
					{canMutate && actions ? (
						<div
							className="flex shrink-0 items-center gap-1.5"
							onClick={(e) => e.stopPropagation()}
						>
							{actions}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
