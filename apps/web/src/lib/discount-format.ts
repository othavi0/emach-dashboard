const PCT_MAX = 100;

const MONEY_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Mantém só dígitos e uma vírgula decimal (sem símbolo). */
export function sanitizePercent(display: string): string {
	let cleaned = display.replace(/[^\d.,]/g, "").replace(/\./g, ",");
	const firstComma = cleaned.indexOf(",");
	if (firstComma >= 0) {
		cleaned =
			cleaned.slice(0, firstComma + 1) +
			cleaned.slice(firstComma + 1).replace(/,/g, "");
	}
	return cleaned;
}

export function parsePercent(display: string): number {
	const cleaned = sanitizePercent(display).replace(",", ".");
	if (!cleaned || cleaned === ".") {
		return 0;
	}
	const n = Number(cleaned);
	if (Number.isNaN(n)) {
		return 0;
	}
	return Math.min(PCT_MAX, Math.max(0, n));
}

export function formatPercent(value: number): string {
	if (!value) {
		return "";
	}
	return String(value).replace(".", ",");
}

export function parseMoney(display: string): number {
	const digits = display.replace(/\D/g, "");
	if (!digits) {
		return 0;
	}
	return Number(digits) / 100;
}

export function formatMoney(value: number): string {
	if (!value) {
		return "";
	}
	return MONEY_FMT.format(value);
}
