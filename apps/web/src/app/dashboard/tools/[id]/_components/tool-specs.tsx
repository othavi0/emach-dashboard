import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { HelpTooltip } from "@/components/help-tooltip";
import { formatMeasure } from "@/lib/format/number";
import { FISCAL_HELP, MODEL_HELP } from "../../_components/fields/spec-help";
import type { AttributeGroup } from "../_lib/attribute-grouping";
import type { SpecDivergences } from "../_lib/spec-divergence";
import type { ToolDetailRow } from "../_lib/tool-detail-data";
import { AttributeValue } from "./attribute-value";

interface ToolSpecsProps {
	attributeGroups: AttributeGroup[];
	divergences: SpecDivergences;
	tool: ToolDetailRow;
}

export function ToolSpecs({
	tool,
	attributeGroups,
	divergences,
}: ToolSpecsProps) {
	const weightDiverges = divergences.fixed.has("weightKg");
	const powerDiverges = divergences.fixed.has("powerWatts");

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-5">
				<SpecSection title="Físicas">
					<SpecField
						help={<HelpTooltip label="Sobre Modelo" text={MODEL_HELP.model} />}
						label="Modelo"
						value={tool.model}
					/>
					<SpecField
						help={
							<HelpTooltip
								label="Sobre Modelo NF"
								text={MODEL_HELP.invoiceModel}
							/>
						}
						label="Modelo NF"
						value={tool.invoiceModel}
					/>
					<SpecField label="Fabricante" value={tool.manufacturerName} />
					<SpecField
						diverges={powerDiverges}
						label="Potência"
						value={tool.powerWatts === null ? null : `${tool.powerWatts} W`}
					/>
					<SpecField
						diverges={weightDiverges}
						label="Peso"
						value={
							tool.weightKg === null
								? null
								: `${formatMeasure(tool.weightKg)} kg`
						}
					/>
					<SpecField
						label="Dimensões"
						value={
							tool.lengthCm !== null &&
							tool.widthCm !== null &&
							tool.heightCm !== null
								? `${formatMeasure(tool.lengthCm, 2)} × ${formatMeasure(tool.widthCm, 2)} × ${formatMeasure(tool.heightCm, 2)} cm`
								: null
						}
					/>
				</SpecSection>

				{attributeGroups.map((group) => (
					<SpecSection
						key={group.categoryId}
						title={`Técnicas · ${group.categoryName}`}
					>
						{group.attributes.map((a) => (
							<div key={a.slug}>
								<dt className="flex items-center gap-1 text-muted-foreground text-xs">
									{a.label}
									{divergences.attributeSlugs.has(a.slug) && <DivergenceMark />}
								</dt>
								<dd>
									<AttributeValue attr={a} />
								</dd>
							</div>
						))}
					</SpecSection>
				))}

				<SpecSection title="Classificação fiscal">
					<SpecField
						help={<HelpTooltip label="Sobre HS Code" {...FISCAL_HELP.hsCode} />}
						label="HS Code"
						value={tool.hsCode}
					/>
					<SpecField
						help={<HelpTooltip label="Sobre NCM" {...FISCAL_HELP.ncm} />}
						label="NCM"
						value={tool.ncm}
					/>
					<SpecField
						help={<HelpTooltip label="Sobre CEST" {...FISCAL_HELP.cest} />}
						label="CEST"
						value={tool.cest}
					/>
				</SpecSection>
			</div>
		</TooltipProvider>
	);
}

function SpecSection({
	title,
	children,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<section>
			<h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h3>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid-cols-3">
				{children}
			</dl>
		</section>
	);
}

function SpecField({
	label,
	value,
	help,
	diverges,
}: {
	diverges?: boolean;
	help?: ReactNode;
	label: string;
	value: string | null;
}) {
	return (
		<div>
			<dt className="flex items-center gap-1 text-muted-foreground text-xs">
				{label}
				{help}
				{diverges && <DivergenceMark />}
			</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}

function DivergenceMark() {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label="Valor diverge entre cadastro e ficha técnica"
				render={<span className="inline-flex text-warning" />}
			>
				<TriangleAlert aria-hidden className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>
				Valor diverge entre o cadastro (coluna fixa) e a ficha técnica
				(atributo).
			</TooltipContent>
		</Tooltip>
	);
}
