import type { Mask } from "./index";

const PCT_MAX = 100;

function sanitizePct(display: string): string {
	let cleaned = display
		.replace("%", "")
		.replace(/\./g, ",")
		.replace(/[^\d,]/g, "");
	const firstComma = cleaned.indexOf(",");
	if (firstComma >= 0) {
		cleaned =
			cleaned.slice(0, firstComma + 1) +
			cleaned.slice(firstComma + 1).replace(/,/g, "");
	}
	return cleaned;
}

function parsePct(display: string): number | undefined {
	const cleaned = sanitizePct(display).replace(",", ".");
	if (!cleaned || cleaned === ".") {
		return;
	}
	const n = Number(cleaned);
	if (Number.isNaN(n)) {
		return;
	}
	if (n > PCT_MAX) {
		return PCT_MAX;
	}
	if (n < 0) {
		return 0;
	}
	return n;
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
