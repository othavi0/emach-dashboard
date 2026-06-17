/**
 * Formata um número — ou a string numérica crua que o Postgres devolve para
 * colunas `numeric` (ex.: "5.000", "28.00") — no padrão pt-BR: vírgula decimal,
 * ponto de milhar, sem zeros à direita supérfluos.
 *
 * Use SEMPRE para medidas (peso, dimensões) antes de exibir. Renderizar a string
 * crua do Postgres é um bug de locale: o ponto decimal americano é lido como
 * separador de milhar em pt-BR — "5.000 kg" (5 kg) vira "cinco mil kg".
 *
 * Número puro (`toLocaleString`) não tem o problema de fuso de datas, então é
 * permitido em componente (ver apps/web/CLAUDE.md → "Datas de exibição").
 */
export function formatMeasure(
	value: string | number | null | undefined,
	maxFractionDigits = 3
): string | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	if (Number.isNaN(n)) {
		return null;
	}
	return n.toLocaleString("pt-BR", {
		maximumFractionDigits: maxFractionDigits,
	});
}
