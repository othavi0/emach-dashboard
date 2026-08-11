import { parseLocaleNumber } from "./masks/parse-decimal";

const PCT_MAX = 100;
const NON_NUMERIC = /[^\d.,]/g;
const PCT_MAX_FRACTION = 2;

const MONEY_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Mantém só dígitos e separadores, preservando o que o usuário digitou. */
export function sanitizePercent(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

export function parsePercent(display: string): number {
	const n = parseLocaleNumber(display, PCT_MAX_FRACTION);
	if (n === undefined) {
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
