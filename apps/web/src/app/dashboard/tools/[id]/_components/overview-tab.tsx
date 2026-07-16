import type { ReactNode } from "react";
import { SwitchTabButton } from "@/components/entity/switch-tab-button";
import { ToolDescription } from "@/components/tool-description";
import { formatDayMonthShortYear } from "@/lib/format/datetime";
import { formatMeasure } from "@/lib/format/number";
import { groupAttributesByCategory } from "../_lib/attribute-grouping";
import { detectSpecDivergences } from "../_lib/spec-divergence";
import type {
	ToolCartSummary,
	ToolDetailAttribute,
	ToolDetailCategory,
	ToolDetailImage,
	ToolDetailRow,
	ToolDetailVariant,
	ToolStockSummary,
} from "../_lib/tool-detail-data";
import { BarcodesCard } from "./barcodes-card";
import { ImageCarousel } from "./image-carousel";
import { SectionCard } from "./section-card";
import { ToolSpecs } from "./tool-specs";

interface OverviewTabProps {
	attributes: ToolDetailAttribute[];
	cartSummary: ToolCartSummary;
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	stockSummary: ToolStockSummary;
	tool: ToolDetailRow;
	variants: ToolDetailVariant[];
}

export function OverviewTab({
	tool,
	images,
	categories,
	attributes,
	stockSummary,
	cartSummary,
	variants,
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
							<SwitchTabButton
								className="text-info text-xs hover:underline"
								tab="estoque"
							>
								Ver aba →
							</SwitchTabButton>
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

					<BarcodesCard variants={variants} />

					<SectionCard title="Carrinho (ecommerce)">
						<div className="grid grid-cols-3 text-center">
							<CartWindow label="15 dias" value={cartSummary.d15} withBorder />
							<CartWindow label="30 dias" value={cartSummary.d30} withBorder />
							<CartWindow label="90 dias" value={cartSummary.d90} />
						</div>
					</SectionCard>

					<SectionCard title="Logística & metadados">
						<dl className="flex flex-col gap-2 text-sm">
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
							<MetaRow label="Embalagem">
								{Number(tool.packagingWeightKg) > 0
									? `+${formatMeasure(tool.packagingWeightKg)} kg`
									: "—"}
							</MetaRow>
							<MetaRow label="Envio">
								{tool.shipsInOwnBox
									? "Embalagem própria"
									: "Consolida em caixa"}
								{tool.stackable ? "" : " · não empilhável"}
								{tool.uprightOnly ? " · este lado para cima" : ""}
							</MetaRow>
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

function CartWindow({
	label,
	value,
	withBorder = false,
}: {
	label: string;
	value: number;
	withBorder?: boolean;
}) {
	return (
		<div className={withBorder ? "border-border border-r" : undefined}>
			<p className="font-semibold text-2xl text-primary tabular-nums">
				{value}
			</p>
			<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
				{label}
			</p>
		</div>
	);
}
