/**
 * Validação e formatação de CPF/CNPJ (BR). Sem deps externas.
 *
 * CNPJ alfanumérico (IN RFB 2.229/2024): as 12 primeiras posições aceitam A-Z,
 * então o documento é normalizado para maiúsculas sem pontuação, não só dígitos.
 * CPF continua só com dígitos. A lógica copia
 * `emach-ecommerce/packages/validators/src/cpf-cnpj.ts`, que grava o mesmo
 * `client.document`: mudança num lado exige a mesma no outro.
 */

const NON_DIGITS_RE = /\D/g;
const NON_ALNUM_RE = /[^0-9A-Z]/g;
const ONLY_DIGITS_RE = /^\d*$/;
const CNPJ_RE = /^[0-9A-Z]{12}\d{2}$/;
const ALL_SAME_CHAR_RE = /^(.)\1+$/;

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeDocument(input: string | null | undefined): string {
	if (!input) {
		return "";
	}

	return input.toUpperCase().replace(NON_ALNUM_RE, "");
}

export function formatDocument(input: string | null | undefined): string {
	const d = normalizeDocument(input);

	if (d.length === 11 && ONLY_DIGITS_RE.test(d)) {
		return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
	}

	if (d.length === 14) {
		return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
	}

	return d;
}

function cpfCheck(digits: string, length: number): number {
	let sum = 0;

	for (let i = 0; i < length; i++) {
		sum += Number(digits[i]) * (length + 1 - i);
	}

	const rest = (sum * 10) % 11;

	return rest === 10 ? 0 : rest;
}

export function isValidCpf(input: string | null | undefined): boolean {
	const d = input ? input.replace(NON_DIGITS_RE, "") : "";

	if (d.length !== 11 || ALL_SAME_CHAR_RE.test(d)) {
		return false;
	}

	if (cpfCheck(d, 9) !== Number(d[9])) {
		return false;
	}

	return cpfCheck(d, 10) === Number(d[10]);
}

// Valor de cada caractere = código ASCII - 48 (0-9 → 0-9, A-Z → 17-42),
// conforme o manual de cálculo do DV do CNPJ alfanumérico do Serpro.
function cnpjCheck(cnpj: string, weights: number[]): number {
	let sum = 0;

	for (let i = 0; i < weights.length; i++) {
		sum += (cnpj.charCodeAt(i) - 48) * (weights[i] ?? 0);
	}

	const rest = sum % 11;

	return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(input: string | null | undefined): boolean {
	const d = normalizeDocument(input);

	if (!CNPJ_RE.test(d) || ALL_SAME_CHAR_RE.test(d)) {
		return false;
	}

	if (cnpjCheck(d, CNPJ_WEIGHTS_1) !== Number(d[12])) {
		return false;
	}

	return cnpjCheck(d, CNPJ_WEIGHTS_2) === Number(d[13]);
}

export function isValidDocument(input: string | null | undefined): boolean {
	const d = normalizeDocument(input);

	if (d.length === 11) {
		return ONLY_DIGITS_RE.test(d) && isValidCpf(d);
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
