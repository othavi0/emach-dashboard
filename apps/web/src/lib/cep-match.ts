/**
 * Pure CEP-matching utilities — usable in both server and client contexts.
 * No DB imports. No server-only dependencies.
 *
 * Server-side convenience wrapper (getBranchByCep) stays in
 * packages/db/src/queries/branch-cep.ts.
 *
 * NOTE: normalizeCep + matchBranchByCep are also present in
 * packages/db/src/queries/branch-cep.ts for use in server-side consumers.
 * The duplication is intentional: branch-cep.ts is in the ADR-0009
 * sync surface and cannot import from apps/web.
 */

export interface CepRange {
	from: string;
	label?: string;
	to: string;
}

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
 * Em sobreposição de faixas entre filiais, retorna a PRIMEIRA filial cujo range
 * cobre o CEP (ordem do array). Sugestão não-autoritativa.
 */
export function matchBranchByCep(
	cep: string,
	branches: BranchWithCepRanges[]
): string | null {
	const normalized = normalizeCep(cep);
	if (!normalized) {
		return null;
	}
	for (const b of branches) {
		if (!b.cepRanges || b.cepRanges.length === 0) {
			continue;
		}
		if (b.cepRanges.some((range) => cepInRange(normalized, range))) {
			return b.id;
		}
	}
	return null;
}
