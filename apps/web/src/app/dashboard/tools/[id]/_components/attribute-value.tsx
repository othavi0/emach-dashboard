import { formatMeasure } from "@/lib/format/number";
import type { ToolDetailAttribute } from "../_lib/tool-detail-data";

/** Valor numérico de spec em pt-BR (vírgula decimal), ou "—" quando ausente. */
function formatSpecNumber(value: number | null): string {
	return value === null ? "—" : (formatMeasure(value, 4) ?? "—");
}

/**
 * `isAttributeFilled` considera preenchido um numeric_range com só um lado —
 * então aqui os lados podem chegar parcialmente nulos (min-only/max-only).
 */
function formatNumericRange(
	lo: number | null,
	hi: number | null,
	unit: string
): string {
	const hasLo = lo !== null;
	const hasHi = hi !== null;

	if (hasLo && hasHi) {
		return `${formatSpecNumber(lo)} – ${formatSpecNumber(hi)}${unit}`;
	}
	if (hasLo) {
		return `mín. ${formatSpecNumber(lo)}${unit}`;
	}
	if (hasHi) {
		return `máx. ${formatSpecNumber(hi)}${unit}`;
	}
	return "—";
}

export function AttributeValue({ attr }: { attr: ToolDetailAttribute }) {
	if (attr.inputType === "color" && attr.options?.kind === "color") {
		const swatch = attr.options.swatches.find(
			(s) => s.value === attr.valueText
		);
		if (swatch) {
			return (
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden
						className="inline-block size-3 rounded-full ring-1 ring-border"
						style={{ backgroundColor: swatch.hex }}
					/>
					{swatch.label}
				</span>
			);
		}
		return <>{attr.valueText ?? "—"}</>;
	}

	if (attr.inputType === "select" && attr.options?.kind === "select") {
		const option = attr.options.options.find((o) => o.value === attr.valueText);
		return <>{option?.label ?? attr.valueText ?? "—"}</>;
	}

	if (attr.inputType === "boolean") {
		if (attr.valueBool === null) {
			return <>—</>;
		}
		return <>{attr.valueBool ? "Sim" : "Não"}</>;
	}

	const unit = attr.unit ? ` ${attr.unit}` : "";

	if (attr.inputType === "numeric_range") {
		return (
			<>{formatNumericRange(attr.valueNumeric, attr.valueNumericMax, unit)}</>
		);
	}

	if (attr.inputType === "number") {
		return <>{`${formatSpecNumber(attr.valueNumeric)}${unit}`}</>;
	}

	return <>{attr.valueText ?? "—"}</>;
}
