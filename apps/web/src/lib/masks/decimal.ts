import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

/** Colunas de medida são numeric(10,3) — milésimos são válidos. */
const DECIMAL_MAX_FRACTION = 3;
const NON_NUMERIC = /[^\d.,]/g;

function sanitizeDecimal(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parseDecimalDisplay(display: string): number | undefined {
	return parseLocaleNumber(display, DECIMAL_MAX_FRACTION);
}

function formatDecimal(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return String(raw).replace(".", ",");
}

export const decimalMask: Mask<number> = {
	format: formatDecimal,
	parse: parseDecimalDisplay,
	sanitize: sanitizeDecimal,
	inputMode: "decimal",
	placeholder: "Ex: 2,5",
};
