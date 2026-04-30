import type { Mask } from "./index";

function sanitizeDecimal(display: string): string {
	let cleaned = display.replace(/\./g, ",").replace(/[^\d,]/g, "");
	const firstComma = cleaned.indexOf(",");
	if (firstComma >= 0) {
		cleaned =
			cleaned.slice(0, firstComma + 1) +
			cleaned.slice(firstComma + 1).replace(/,/g, "");
	}
	return cleaned;
}

function parseDecimalDisplay(display: string): number | undefined {
	const cleaned = sanitizeDecimal(display).replace(",", ".");
	if (!cleaned || cleaned === ".") {
		return;
	}
	const n = Number(cleaned);
	return Number.isNaN(n) ? undefined : n;
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
