import type { Mask } from "./index";

function sanitizeInteger(display: string): string {
	return display.replace(/\D/g, "");
}

function parseIntegerDisplay(display: string): number | undefined {
	const cleaned = sanitizeInteger(display);
	if (!cleaned) {
		return;
	}
	const n = Number(cleaned);
	return Number.isNaN(n) ? undefined : n;
}

function formatInteger(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return String(Math.trunc(Math.abs(raw)));
}

export const integerMask: Mask<number> = {
	format: formatInteger,
	parse: parseIntegerDisplay,
	sanitize: sanitizeInteger,
	inputMode: "numeric",
	placeholder: "Ex: 700",
};
