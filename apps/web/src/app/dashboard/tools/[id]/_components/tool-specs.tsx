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
					<SpecField label="HS Code" value={tool.hsCode} />
					<SpecField label="NCM" value={tool.ncm} />
					<SpecField label="CEST" value={tool.cest} />
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

function SpecField({ label, value }: { label: string; value: string | null }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}
