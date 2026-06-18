/**
 * Validação e formatação de CPF/CNPJ (BR).
 * Sem deps externas. Algoritmo dígito verificador mod 11.
 */

export function normalizeDocument(input: string | null | undefined): string {
	if (!input) {
		return "";
	}
	return input.replace(/\D+/g, "");
}

export function formatDocument(input: string | null | undefined): string {
	const digits = normalizeDocument(input);
	if (digits.length === 11) {
		return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
	}
	if (digits.length === 14) {
		return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
	}
	return digits;
}

const ALL_SAME_DIGIT_RE = /^(\d)\1+$/;

function allSameDigit(digits: string): boolean {
	return ALL_SAME_DIGIT_RE.test(digits);
}

export function isValidCpf(input: string | null | undefined): boolean {
	const d = normalizeDocument(input);
	if (d.length !== 11 || allSameDigit(d)) {
		return false;
	}
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		sum += Number.parseInt(d[i]!, 10) * (10 - i);
	}
	let dv1 = (sum * 10) % 11;
	if (dv1 === 10) {
		dv1 = 0;
	}
	// biome-ignore lint/style/noNonNullAssertion: length checked at top of function
	if (dv1 !== Number.parseInt(d[9]!, 10)) {
		return false;
	}
	sum = 0;
	for (let i = 0; i < 10; i++) {
		// biome-ignore lint/style/noNonNullAssertion: length checked at top of function
		sum += Number.parseInt(d[i]!, 10) * (11 - i);
	}
	let dv2 = (sum * 10) % 11;
	if (dv2 === 10) {
		dv2 = 0;
	}
	// biome-ignore lint/style/noNonNullAssertion: length checked at top of function
	return dv2 === Number.parseInt(d[10]!, 10);
}

export function isValidCnpj(input: string | null | undefined): boolean {
	const d = normalizeDocument(input);
	if (d.length !== 14 || allSameDigit(d)) {
		return false;
	}
	const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
	const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		sum += Number.parseInt(d[i]!, 10) * w1[i]!;
	}
	let dv1 = sum % 11;
	dv1 = dv1 < 2 ? 0 : 11 - dv1;
	// biome-ignore lint/style/noNonNullAssertion: length checked above
	if (dv1 !== Number.parseInt(d[12]!, 10)) {
		return false;
	}
	sum = 0;
	for (let i = 0; i < 13; i++) {
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		sum += Number.parseInt(d[i]!, 10) * w2[i]!;
	}
	let dv2 = sum % 11;
	dv2 = dv2 < 2 ? 0 : 11 - dv2;
	// biome-ignore lint/style/noNonNullAssertion: length checked above
	return dv2 === Number.parseInt(d[13]!, 10);
}

export function isValidDocument(input: string | null | undefined): boolean {
	const d = normalizeDocument(input);
	if (d.length === 11) {
		return isValidCpf(d);
	}
	if (d.length === 14) {
		return isValidCnpj(d);
	}
	return false;
}

/**
 * Use em zod: `z.string().refine(documentZodRefine, "Documento inválido")`.
 * Aceita também string vazia (use `.optional()` no schema se opcional).
 */
export function documentZodRefine(value: string): boolean {
	if (!value) {
		return true;
	}
	return isValidDocument(value);
}

/**
 * Alias de normalizeDocument restrito a CNPJ.
 * Mantido para compatibilidade com importadores de validation/cnpj.
 * Prefer normalizeDocument para uso genérico.
 */
export const normalizeCnpj = normalizeDocument;
