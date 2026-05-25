import { Badge } from "@emach/ui/components/badge";
import Link from "next/link";

import type { ToolDetail } from "../_lib/tool-detail-data";
import { ToolDetailActions } from "./tool-detail-actions";

const STATUS_LABEL: Record<string, string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
	out_of_stock: "Sem estoque",
};

const STATUS_VARIANT: Record<
	string,
	"default" | "destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

interface ToolDetailHeaderProps {
	canDelete: boolean;
	canMutate: boolean;
	detail: ToolDetail;
}

export function ToolDetailHeader({
	detail,
	canMutate,
	canDelete,
}: ToolDetailHeaderProps) {
	const { tool, images, stockSummary } = detail;
	const defaultVariant = detail.variants.find((v) => v.isDefault);
	const cover = images[0];

	return (
		<header className="sticky top-0 z-10 flex flex-col gap-3 border-border border-b bg-background pt-2 pb-4">
			<div className="flex items-center gap-4">
				{cover ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					<img
						alt=""
						className="size-14 flex-shrink-0 rounded-md object-cover"
						src={cover.url}
					/>
				) : (
					<div className="size-14 flex-shrink-0 rounded-md bg-muted" />
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<Link
						className="text-muted-foreground text-xs hover:underline"
						href="/dashboard/tools"
					>
						/ Ferramentas /
					</Link>
					<h1 className="truncate font-semibold text-lg">{tool.name}</h1>
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<Badge variant={STATUS_VARIANT[tool.status] ?? "secondary"}>
							{STATUS_LABEL[tool.status] ?? tool.status}
						</Badge>
						{defaultVariant && (
							<>
								<span>·</span>
								<span className="font-mono">SKU: {defaultVariant.sku}</span>
							</>
						)}
						{tool.supplierName && (
							<>
								<span>·</span>
								<span>{tool.supplierName}</span>
							</>
						)}
						<span>·</span>
						<span>
							{tool.visibleOnSite ? (
								<span className="text-success">● Visível no site</span>
							) : (
								<span>○ Oculta</span>
							)}
						</span>
					</div>
				</div>
				<ToolDetailActions
					canDelete={canDelete}
					canMutate={canMutate}
					toolId={tool.id}
					toolName={tool.name}
				/>
			</div>

			{(stockSummary.criticalCount > 0 || stockSummary.reorderCount > 0) && (
				<div className="rounded-md border border-destructive/40 bg-destructive/15 px-3 py-2 text-destructive text-xs">
					⚠️{" "}
					{stockSummary.alerts.length === 1 ? (
						<>
							{stockSummary.alerts[0]?.branchName} ·{" "}
							{stockSummary.alerts[0]?.variantSku} (
							{stockSummary.alerts[0]?.quantity} ≤{" "}
							{stockSummary.alerts[0]?.reorderPoint}) abaixo do ponto de
							reposição
						</>
					) : (
						<>
							{stockSummary.alerts.length} alertas de reposição —{" "}
							{stockSummary.alerts
								.slice(0, 3)
								.map(
									(a) => `${a.branchName} (${a.quantity} ≤ ${a.reorderPoint})`
								)
								.join(", ")}
							{stockSummary.alerts.length > 3 &&
								`, e mais ${stockSummary.alerts.length - 3}`}
						</>
					)}
				</div>
			)}
		</header>
	);
}
