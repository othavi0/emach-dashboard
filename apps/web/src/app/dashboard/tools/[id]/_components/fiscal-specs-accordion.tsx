import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@emach/ui/components/accordion";

import type {
	ToolDetailAttribute,
	ToolDetailRow,
} from "../_lib/tool-detail-data";

interface FiscalSpecsAccordionProps {
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

export function FiscalSpecsAccordion({
	tool,
	attributes,
}: FiscalSpecsAccordionProps) {
	const hasFiscal = tool.hsCode || tool.ncm || tool.cest;
	const hasFixedSpecs =
		tool.model ||
		tool.invoiceModel ||
		tool.manufacturerName ||
		tool.powerWatts !== null ||
		tool.weightKg !== null ||
		tool.lengthCm !== null ||
		tool.widthCm !== null ||
		tool.heightCm !== null;
	const hasDynamicSpecs = attributes.length > 0;

	if (!(hasFiscal || hasFixedSpecs || hasDynamicSpecs)) {
		return null;
	}

	return (
		<Accordion>
			{hasFiscal && (
				<AccordionItem value="fiscal">
					<AccordionTrigger>Classificação fiscal</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-3 gap-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs uppercase">
									HS Code
								</dt>
								<dd>{tool.hsCode ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs uppercase">NCM</dt>
								<dd>{tool.ncm ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs uppercase">
									CEST
								</dt>
								<dd>{tool.cest ?? "—"}</dd>
							</div>
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
			{hasFixedSpecs && (
				<AccordionItem value="fixed">
					<AccordionTrigger>Especificações fixas</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
							<SpecField label="Modelo" value={tool.model} />
							<SpecField label="Modelo NF" value={tool.invoiceModel} />
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
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
			{hasDynamicSpecs && (
				<AccordionItem value="dynamic">
					<AccordionTrigger>Especificações técnicas</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
							{attributes.map((a) => (
								<SpecField
									key={a.slug}
									label={a.label}
									value={formatAttributeValue(a)}
								/>
							))}
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
		</Accordion>
	);
}

function SpecField({ label, value }: { label: string; value: string | null }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs uppercase">{label}</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}
