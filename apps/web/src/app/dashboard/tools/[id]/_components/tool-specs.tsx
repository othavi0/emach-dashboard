import type { ReactNode } from "react";

import { HelpTooltip } from "@/components/help-tooltip";
import { FISCAL_HELP, MODEL_HELP } from "../../_components/fields/spec-help";
import type {
	ToolDetailAttribute,
	ToolDetailRow,
} from "../_lib/tool-detail-data";

interface ToolSpecsProps {
	attributes: ToolDetailAttribute[];
	tool: ToolDetailRow;
}

function formatAttributeValue(a: ToolDetailAttribute): string {
	if (a.inputType === "boolean") {
		if (a.valueBool === null) {
			return "—";
		}
		return a.valueBool ? "Sim" : "Não";
	}
	if (a.inputType === "numeric_range") {
		const lo = a.valueNumeric ?? "—";
		const hi = a.valueNumericMax ?? "—";
		const unit = a.unit ? ` ${a.unit}` : "";
		return `${lo} – ${hi}${unit}`;
	}
	if (a.inputType === "number") {
		const v = a.valueNumeric ?? "—";
		const unit = a.unit ? ` ${a.unit}` : "";
		return `${v}${unit}`;
	}
	return a.valueText ?? "—";
}

/**
 * Specs da ferramenta sempre visíveis (sem accordion) — a equipe interna lê
 * tudo de relance (PRODUCT.md: densidade > respiro). Cada grupo é uma seção
 * com section marker + grid denso.
 */
export function ToolSpecs({ tool, attributes }: ToolSpecsProps) {
	const hasFiscal = Boolean(tool.hsCode || tool.ncm || tool.cest);
	const hasFixedSpecs = Boolean(
		tool.model ||
			tool.invoiceModel ||
			tool.manufacturerName ||
			tool.powerWatts !== null ||
			tool.weightKg !== null ||
			tool.lengthCm !== null ||
			tool.widthCm !== null ||
			tool.heightCm !== null
	);
	const hasDynamicSpecs = attributes.length > 0;

	if (!(hasFiscal || hasFixedSpecs || hasDynamicSpecs)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-5">
			{hasFixedSpecs && (
				<SpecSection title="Especificações fixas">
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
						label="Potência"
						value={tool.powerWatts === null ? null : `${tool.powerWatts} W`}
					/>
					<SpecField
						label="Peso"
						value={tool.weightKg === null ? null : `${tool.weightKg} kg`}
					/>
					<SpecField
						label="Dimensões"
						value={
							tool.lengthCm !== null &&
							tool.widthCm !== null &&
							tool.heightCm !== null
								? `${tool.lengthCm} × ${tool.widthCm} × ${tool.heightCm} cm`
								: null
						}
					/>
				</SpecSection>
			)}

			{hasDynamicSpecs && (
				<SpecSection title="Especificações técnicas">
					{attributes.map((a) => (
						<SpecField
							key={a.slug}
							label={a.label}
							value={formatAttributeValue(a)}
						/>
					))}
				</SpecSection>
			)}

			{hasFiscal && (
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
			)}
		</div>
	);
}

function SpecSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
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
}: {
	label: string;
	value: string | null;
	help?: ReactNode;
}) {
	return (
		<div>
			<dt className="flex items-center gap-1 text-muted-foreground text-xs">
				{label}
				{help}
			</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}
