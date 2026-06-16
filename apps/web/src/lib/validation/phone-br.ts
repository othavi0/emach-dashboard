const NON_DIGIT_RE = /\D/g;

export function normalizePhoneBr(input: string): string {
	return input.replace(NON_DIGIT_RE, "");
}

// Telefone BR válido: DDD (2 dígitos) + 8 (fixo) ou 9 (celular) dígitos.
export function isValidPhoneBr(input: string): boolean {
	const digits = normalizePhoneBr(input);
	return digits.length === 10 || digits.length === 11;
}
