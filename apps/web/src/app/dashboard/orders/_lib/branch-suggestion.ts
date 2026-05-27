/** Faixa de CEP `from <= to` (validação de ordem fica com o caller via Zod). */
export type CepRange = { from: string; to: string };

export interface BranchWithCepRanges {
	cepRanges: CepRange[] | null | undefined;
	id: string;
}

const CEP_DIGITS = /^\d{8}$/;

export function normalizeCep(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}
	const digits = raw.replace(/\D/g, "");
	return CEP_DIGITS.test(digits) ? digits : null;
}

function cepInRange(cep: string, range: CepRange): boolean {
	const from = normalizeCep(range.from);
	const to = normalizeCep(range.to);
	if (!(from && to)) {
		return false;
	}
	return cep >= from && cep <= to;
}

/**
 * Em caso de sobreposição de ranges entre filiais, retorna a PRIMEIRA filial
 * cujo range cobre o CEP (ordem do array de entrada). Documentar pra quem
 * configurar.
 */
export function suggestBranchForCep(
	cep: string,
	branches: BranchWithCepRanges[]
): string | null {
	const normalized = normalizeCep(cep);
	if (!normalized) {
		return null;
	}
	for (const branch of branches) {
		if (!branch.cepRanges || branch.cepRanges.length === 0) {
			continue;
		}
		if (branch.cepRanges.some((range) => cepInRange(normalized, range))) {
			return branch.id;
		}
	}
	return null;
}
