import {
	BRASIL_PRESET,
	UF_CEP_PRESETS,
} from "@/app/dashboard/branches/_components/cep-presets";

interface Range {
	from: string;
	label?: string;
	to: string;
}

function ufForRange(r: Range): string | null {
	const preset = UF_CEP_PRESETS.find((p) =>
		p.ranges.some((pr) => pr.from === r.from && pr.to === r.to)
	);
	return preset?.uf ?? null;
}

/** Nome legível da zona derivado da cobertura de CEP (sem entrada do usuário). */
export function deriveZoneName(cepRanges: Range[]): string {
	if (cepRanges.length === 0) {
		return "Faixa personalizada";
	}
	const isBrasil = cepRanges.some(
		(r) => r.from === BRASIL_PRESET.from && r.to === BRASIL_PRESET.to
	);
	if (isBrasil) {
		return "Brasil";
	}
	const ufs: string[] = [];
	for (const r of cepRanges) {
		const uf = ufForRange(r);
		if (uf && !ufs.includes(uf)) {
			ufs.push(uf);
		}
	}
	if (ufs.length === 0) {
		return "Faixa personalizada";
	}
	if (ufs.length === 1) {
		const preset = UF_CEP_PRESETS.find((p) => p.uf === ufs[0]);
		return preset?.name ?? (ufs[0] as string);
	}
	if (ufs.length <= 3) {
		return ufs.join(", ");
	}
	return `${ufs.length} estados`;
}
