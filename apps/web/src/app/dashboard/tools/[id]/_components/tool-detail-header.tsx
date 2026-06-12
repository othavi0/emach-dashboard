import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Badge } from "@emach/ui/components/badge";
import { Eye, EyeOff, TriangleAlert, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { ToolDetail } from "../_lib/tool-detail-data";

const STATUS_LABEL: Record<string, string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
};

const STATUS_VARIANT: Record<
	string,
	"default" | "destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
};

interface ToolDetailHeaderProps {
	actions?: ReactNode;
	detail: ToolDetail;
}

export function ToolDetailHeader({ detail, actions }: ToolDetailHeaderProps) {
	const { tool, images, stockSummary } = detail;
	const defaultVariant = detail.variants.find((v) => v.isDefault);
	const cover = images[0];
	const hasAlert =
		stockSummary.criticalCount > 0 || stockSummary.reorderCount > 0;

	const subtitleParts: string[] = [];
	if (defaultVariant) {
		subtitleParts.push(`SKU ${defaultVariant.sku}`);
	}
	if (tool.supplierName) {
		subtitleParts.push(tool.supplierName);
	}

	return (
		<div className="flex flex-col gap-3">
			<EntityIdentityHeader
				actions={actions}
				avatarFallback={<Wrench aria-hidden className="size-5" />}
				avatarUrl={cover?.url}
				badges={
					<>
						<Badge variant={STATUS_VARIANT[tool.status] ?? "secondary"}>
							{STATUS_LABEL[tool.status] ?? tool.status}
						</Badge>
						{tool.status === "active" && stockSummary.totalStock === 0 && (
							<Badge variant="destructive">Esgotado</Badge>
						)}
						{tool.visibleOnSite ? (
							<Badge variant="success">
								<Eye aria-hidden className="size-3" />
								Visível no site
							</Badge>
						) : (
							<Badge variant="outline">
								<EyeOff aria-hidden className="size-3" />
								Oculta
							</Badge>
						)}
					</>
				}
				subtitle={
					subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined
				}
				title={tool.name}
			/>

			{hasAlert && (
				<Alert variant="destructive">
					<TriangleAlert aria-hidden />
					<AlertDescription className="text-destructive/90">
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
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
