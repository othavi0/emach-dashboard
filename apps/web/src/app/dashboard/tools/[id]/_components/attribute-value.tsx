import type { ToolDetailAttribute } from "../_lib/tool-detail-data";

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
		const lo = attr.valueNumeric ?? "—";
		const hi = attr.valueNumericMax ?? "—";
		return <>{`${lo} – ${hi}${unit}`}</>;
	}

	if (attr.inputType === "number") {
		const v = attr.valueNumeric ?? "—";
		return <>{`${v}${unit}`}</>;
	}

	return <>{attr.valueText ?? "—"}</>;
}
