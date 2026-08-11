const NON_NUMERIC = /[^\d.,]/g;
const SEPARATORS = /[.,]/g;
const THOUSANDS_GROUP_SIZE = 3;

/**
 * Lê um número digitado em pt-BR ou en-US sem exigir um separador específico.
 *
 * Três regras, nesta ordem:
 * 1. Dois ou mais separadores, todos o MESMO caractere → todos são milhar;
 *    não há parte decimal ("1.000.000" → 1000000, "1,234,567" → 1234567).
 * 2. Separadores de tipos diferentes → o ÚLTIMO é o decimal, os anteriores
 *    são milhar e descartados ("1.234,56" e "1,234.56" → 1234.56).
 * 3. Separador único: ambíguo só quando seguido de exatamente 3 dígitos —
 *    aí é milhar se o campo não aceita 3 casas decimais, senão é decimal
 *    ("1.500" é 1500 em dinheiro, 1,5 em peso).
 *
 * Valores negativos não são aceitos: o sinal é descartado junto com os
 * demais símbolos (mesmo tratamento de "R$", "%", espaços etc.).
 */
export function parseLocaleNumber(
	display: string,
	maxFractionDigits: number
): number | undefined {
	const cleaned = display.replace(NON_NUMERIC, "");
	if (!cleaned) {
		return;
	}

	const separators = cleaned.match(SEPARATORS) ?? [];
	if (separators.length === 0) {
		return toNumber(cleaned, maxFractionDigits);
	}

	const digitsOnly = cleaned.replace(SEPARATORS, "");
	if (!digitsOnly) {
		return;
	}

	const isUniformSeparator = new Set(separators).size === 1;
	if (separators.length > 1 && isUniformSeparator) {
		return toNumber(digitsOnly, maxFractionDigits);
	}

	const lastSeparator = Math.max(
		cleaned.lastIndexOf("."),
		cleaned.lastIndexOf(",")
	);
	const intDigits = cleaned.slice(0, lastSeparator).replace(SEPARATORS, "");
	const fracDigits = cleaned.slice(lastSeparator + 1).replace(SEPARATORS, "");

	const isThousandsSeparator =
		separators.length === 1 &&
		intDigits.length > 0 &&
		fracDigits.length === THOUSANDS_GROUP_SIZE &&
		maxFractionDigits < THOUSANDS_GROUP_SIZE;
	if (isThousandsSeparator) {
		return toNumber(intDigits + fracDigits, maxFractionDigits);
	}

	return toNumber(
		`${intDigits || "0"}.${fracDigits || "0"}`,
		maxFractionDigits
	);
}

function toNumber(raw: string, maxFractionDigits: number): number | undefined {
	const n = Number(raw);
	if (Number.isNaN(n)) {
		return;
	}
	return Number(n.toFixed(maxFractionDigits));
}
