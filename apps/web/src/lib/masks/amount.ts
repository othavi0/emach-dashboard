import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

/** Valores monetários são numeric(10,2) — centavos, nunca milésimos. */
const AMOUNT_MAX_FRACTION = 2;
const NON_NUMERIC = /[^\d.,]/g;

const AMOUNT_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: AMOUNT_MAX_FRACTION,
	maximumFractionDigits: AMOUNT_MAX_FRACTION,
});

function sanitizeAmount(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parseAmount(display: string): number | undefined {
	return parseLocaleNumber(display, AMOUNT_MAX_FRACTION);
}

function formatAmount(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return AMOUNT_FMT.format(raw);
}

export const amountMask: Mask<number> = {
	format: formatAmount,
	parse: parseAmount,
	sanitize: sanitizeAmount,
	inputMode: "decimal",
	placeholder: "Ex: 1.234,56",
};
