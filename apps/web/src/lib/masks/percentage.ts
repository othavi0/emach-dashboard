import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

const PCT_MAX = 100;
const PCT_MAX_FRACTION = 2;
const NON_NUMERIC = /[^\d.,]/g;

function sanitizePct(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parsePct(display: string): number | undefined {
	const n = parseLocaleNumber(display, PCT_MAX_FRACTION);
	if (n === undefined) {
		return;
	}
	return Math.min(PCT_MAX, Math.max(0, n));
}

function formatPct(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return `${String(raw).replace(".", ",")}%`;
}

export const percentageMask: Mask<number> = {
	format: formatPct,
	parse: parsePct,
	sanitize: sanitizePct,
	inputMode: "decimal",
	placeholder: "Ex: 10",
};
