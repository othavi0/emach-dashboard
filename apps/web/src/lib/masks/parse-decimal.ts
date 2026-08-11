const NON_NUMERIC = /[^\d.,]/g;
const SEPARATORS = /[.,]/g;
const THOUSANDS_GROUP_SIZE = 3;

/**
 * Lê um número digitado em pt-BR ou en-US sem exigir um separador específico.
 *
 * Regra: o ÚLTIMO separador (`.` ou `,`) delimita a parte decimal; os
 * anteriores são separador de milhar e são descartados. Um separador único
 * seguido de exatamente 3 dígitos é milhar quando o campo não aceita 3 casas
 * decimais — é o único caso ambíguo ("1.500" é 1500 em dinheiro, 1,5 em peso).
 */
export function parseLocaleNumber(
	display: string,
	maxFractionDigits: number
): number | undefined {
	const cleaned = display.replace(NON_NUMERIC, "");
	if (!cleaned) {
		return;
	}

	const lastSeparator = Math.max(
		cleaned.lastIndexOf("."),
		cleaned.lastIndexOf(",")
	);
	if (lastSeparator < 0) {
		return toNumber(cleaned, maxFractionDigits);
	}

	const intDigits = cleaned.slice(0, lastSeparator).replace(SEPARATORS, "");
	const fracDigits = cleaned.slice(lastSeparator + 1).replace(SEPARATORS, "");
	if (!(intDigits || fracDigits)) {
		return;
	}

	const separatorCount = (cleaned.match(SEPARATORS) ?? []).length;
	const isThousandsSeparator =
		separatorCount === 1 &&
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
