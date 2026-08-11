import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

const NON_NUMERIC = /[^\d.,]/g;

function sanitizeDecimal(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function formatDecimal(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return String(raw).replace(".", ",");
}

/** Máscara decimal parametrizada pela precisão (escala) da coluna numeric de destino. */
function createDecimalMask(maxFractionDigits: number): Mask<number> {
	return {
		format: formatDecimal,
		parse: (display: string) => parseLocaleNumber(display, maxFractionDigits),
		sanitize: sanitizeDecimal,
		inputMode: "decimal",
		placeholder: "Ex: 2,5",
	};
}

/** Peso: tool.weight_kg/packaging_weight_kg, shipping_box.max_weight_kg/tare_weight_kg — numeric(10,3). */
export const decimalMask: Mask<number> = createDecimalMask(3);

/** Dimensões: tool.length_cm/width_cm/height_cm, shipping_box.internal_length_cm/internal_width_cm/internal_height_cm — numeric(10,2). */
export const dimensionMask: Mask<number> = createDecimalMask(2);

/** Specs numéricas de atributo: attribute_value.value_numeric/value_numeric_max — numeric(14,4). */
export const specNumberMask: Mask<number> = createDecimalMask(4);
