const NON_DIGIT = /\D/g;

/**
 * Formata telefone BR. 10 dígitos → (XX) XXXX-XXXX, 11 → (XX) XXXXX-XXXX.
 * Retorna o valor cru quando não casa, "" para null/vazio.
 */
export function formatPhone(raw: string | null | undefined): string {
	if (!raw) {
		return "";
	}
	const digits = raw.replace(NON_DIGIT, "");
	if (digits.length === 10) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
	}
	if (digits.length === 11) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
	}
	return raw;
}
