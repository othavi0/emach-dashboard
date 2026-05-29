import { and, eq, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { branch } from "../schema/inventory";

export type CepRange = { from: string; to: string; label?: string };

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

/** Consulta filiais ativas com faixas e roda o match. Conveniência server-side. */
export async function getBranchByCep(
	db: NodePgDatabase<Record<string, unknown>>,
	cep: string
): Promise<{ id: string; name: string } | null> {
	const normalized = normalizeCep(cep);
	if (!normalized) {
		return null;
	}
	const rows = await db
		.select({ id: branch.id, name: branch.name, cepRanges: branch.cepRanges })
		.from(branch)
		.where(and(eq(branch.status, "active"), isNotNull(branch.cepRanges)));
	const matchedId = matchBranchByCep(normalized, rows);
	if (!matchedId) {
		return null;
	}
	const found = rows.find((r) => r.id === matchedId);
	return found ? { id: found.id, name: found.name } : null;
}
