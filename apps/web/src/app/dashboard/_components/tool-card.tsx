import { Badge } from "@emach/ui/components/badge";
import { AlertTriangleIcon } from "lucide-react";
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
	out_of_stock: "destructive",
};

const MAX_VARIANT_CHIPS = 4;
const MAX_BRANCH_BREAKDOWN = 3;

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

function formatBranches(branches: ToolCardBranchSummary[]): string {
	const top = branches
		.slice()
		.sort((a, b) => b.quantity - a.quantity)
		.slice(0, MAX_BRANCH_BREAKDOWN);
	const rest = branches.length - top.length;
	const base = top.map((b) => `${b.branchName} ${b.quantity}`).join(" · ");
	return rest > 0 ? `${base} · +${rest} filiais` : base;
}

interface VariantsBlockProps {
	summaries: string[];
}

function VariantsBlock({ summaries }: VariantsBlockProps) {
	const visible = summaries.slice(0, MAX_VARIANT_CHIPS);
	const overflow = summaries.length - visible.length;
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
				Variantes
			</span>
			<div className="flex flex-wrap gap-1">
				{visible.map((v) => (
					<span
						className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs"
						key={v}
						title={v}
					>
						{v}
					</span>
				))}
				{overflow > 0 && (
					<span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
						+{overflow}
					</span>
				)}
			</div>
		</div>
	);
}

interface StockFooterProps {
	actions: React.ReactNode | undefined;
	branches: ToolCardBranchSummary[];
	canMutate: boolean;
	isCritical: boolean;
	totalStock: number;
}

function StockFooter({
	actions,
	branches,
	canMutate,
	isCritical,
	totalStock,
}: StockFooterProps) {
	const branchLabel =
		branches.length > 0
			? ` · ${branches.length} ${branches.length === 1 ? "filial" : "filiais"}`
			: "";
	return (
		<div className="flex items-end justify-between gap-3">
			<div>
				<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
					{`Estoque${branchLabel}`}
				</div>
				<div
					className={`font-medium text-[28px] tabular-nums leading-none ${isCritical ? "text-destructive" : "text-primary"}`}
				>
					{totalStock}
				</div>
				{branches.length > 0 && (
					<div className="mt-1 line-clamp-1 text-muted-foreground text-xs">
						{formatBranches(branches)}
					</div>
				)}
			</div>
			{canMutate && actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}

export function ToolCard({ tool, variant, canMutate, actions }: ToolCardProps) {
	const showVariantsBlock =
		tool.variantCount > 1 && tool.variantSummaries.length > 0;
	const showReorderHeader =
		variant === "stock-overview" && tool.reorderCount > 0;
	const stockIsCritical = tool.reorderCount > 0 && tool.totalStock === 0;

	return (
		<div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80">
			<div className="overflow-hidden rounded-[8px] border border-border">
				{tool.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={tool.name}
						className="aspect-[16/9] w-full object-cover"
						src={tool.imageUrl}
					/>
				) : (
					<div className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
			</div>

			<div className="flex items-start justify-between gap-2">
				{tool.primaryCategoryName ? (
					<Badge variant="outline">{tool.primaryCategoryName}</Badge>
				) : (
					<span />
				)}
				{showReorderHeader ? (
					<Badge variant="warning">
						<AlertTriangleIcon aria-hidden="true" className="size-3" />
						Repor{tool.reorderCount > 1 ? ` (${tool.reorderCount})` : ""}
					</Badge>
				) : (
					<Badge variant={STATUS_BADGE_VARIANT[tool.status] ?? "outline"}>
						{TOOL_STATUS_LABELS[tool.status] ?? tool.status}
					</Badge>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<Link
					className="line-clamp-2 font-medium font-serif text-[17px] text-foreground leading-[1.3] hover:underline"
					href={`/dashboard/tools/${tool.id}`}
				>
					{tool.name}
				</Link>
				<p className="line-clamp-1 text-muted-foreground text-xs">
					{formatMeta(tool) || "—"}
				</p>
				{variant === "catalog" && (
					<p className="text-muted-foreground text-xs">
						{tool.visibleOnSite ? "Visível no site" : "Oculto no site"}
					</p>
				)}
			</div>

			{showVariantsBlock && <VariantsBlock summaries={tool.variantSummaries} />}

			<hr className="border-border" />

			<StockFooter
				actions={actions}
				branches={tool.branches}
				canMutate={canMutate}
				isCritical={stockIsCritical}
				totalStock={tool.totalStock}
			/>
		</div>
	);
}
