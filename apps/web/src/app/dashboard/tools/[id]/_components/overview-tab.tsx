import Link from "next/link";
import type { ReactNode } from "react";

import { ToolDescription } from "@/components/tool-description";
import { formatDayMonthShortYear } from "@/lib/format/datetime";
import { groupAttributesByCategory } from "../_lib/attribute-grouping";
import { detectSpecDivergences } from "../_lib/spec-divergence";
import type {
	ToolDetailAttribute,
	ToolDetailCategory,
	ToolDetailImage,
	ToolDetailRow,
	ToolStockSummary,
} from "../_lib/tool-detail-data";
import { ImageCarousel } from "./image-carousel";
import { SectionCard } from "./section-card";
import { ToolSpecs } from "./tool-specs";

const BRL = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

interface OverviewTabProps {
	attributes: ToolDetailAttribute[];
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	stockSummary: ToolStockSummary;
	tool: ToolDetailRow;
}

export function OverviewTab({
	tool,
	images,
	categories,
	attributes,
	stockSummary,
}: OverviewTabProps) {
	const primaryCategory = categories.find((c) => c.isPrimary);
	const otherCategories = categories.filter((c) => !c.isPrimary);
	const attributeGroups = groupAttributesByCategory(attributes);
	const divergences = detectSpecDivergences(tool, attributes);
	const alertCount = stockSummary.criticalCount + stockSummary.reorderCount;

	return (
		<div className="flex flex-col gap-4">
			<SectionCard title={`Imagens · ${images.length}`}>
				<ImageCarousel images={images} />
			</SectionCard>

			{tool.description && (
				<SectionCard title="Descrição">
					<ToolDescription markdown={tool.description} />
				</SectionCard>
			)}

			<div className="grid gap-4 lg:grid-cols-[1fr_300px]">
				<SectionCard title="Especificações">
					<ToolSpecs
						attributeGroups={attributeGroups}
						divergences={divergences}
						tool={tool}
					/>
				</SectionCard>

				<div className="flex flex-col gap-4">
					<SectionCard
						action={
							<Link
								className="text-info text-xs hover:underline"
								href={`/dashboard/tools/${tool.id}?tab=estoque`}
							>
								Ver aba →
							</Link>
						}
						title="Estoque"
					>
						<p className="font-semibold text-2xl tabular-nums">
							{stockSummary.totalStock}{" "}
							<span className="font-normal text-muted-foreground text-sm">
								unid.
							</span>
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							em {stockSummary.branchCount}{" "}
							{stockSummary.branchCount === 1 ? "filial" : "filiais"}
							{alertCount > 0 && (
								<>
									{" · "}
									<span className="text-destructive">
										{alertCount} em alerta
									</span>
								</>
							)}
						</p>
					</SectionCard>

					<SectionCard title="Logística & metadados">
						<dl className="flex flex-col gap-2 text-sm">
							<MetaRow label="Frete > 30kg">
								{tool.overweightShippingAmount === null
									? "a combinar"
									: BRL.format(Number(tool.overweightShippingAmount))}
							</MetaRow>
							<MetaRow label="Categoria">
								{primaryCategory?.categoryName ?? "—"}
								{otherCategories.length > 0 && (
									<span className="block text-muted-foreground text-xs">
										+ {otherCategories.map((c) => c.categoryName).join(", ")}
									</span>
								)}
							</MetaRow>
							<MetaRow label="Visibilidade">
								{tool.visibleOnSite ? (
									<span className="text-success">Visível no site</span>
								) : (
									<span className="text-muted-foreground">Oculta</span>
								)}
							</MetaRow>
							{tool.slug && (
								<MetaRow label="Slug">
									<span className="font-mono text-xs">{tool.slug}</span>
								</MetaRow>
							)}
							<MetaRow label="Criada">
								{formatDayMonthShortYear(tool.createdAt)}
							</MetaRow>
						</dl>
					</SectionCard>
				</div>
			</div>
		</div>
	);
}

function MetaRow({ label, children }: { children: ReactNode; label: string }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}
