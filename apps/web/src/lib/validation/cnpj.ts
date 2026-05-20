const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(input: string): string {
	return input.replace(/\D/g, "");
}

function calcCheckDigit(digits: string, weights: number[]): number {
	let sum = 0;
	for (let i = 0; i < weights.length; i++) {
		sum += Number(digits[i]) * (weights[i] ?? 0);
	}
	const rem = sum % 11;
	return rem < 2 ? 0 : 11 - rem;
}

export function isValidCnpj(input: string): boolean {
	const cnpj = normalizeCnpj(input);
	if (cnpj.length !== 14) {
		return false;
	}
	if (/^(\d)\1{13}$/.test(cnpj)) {
		return false;
	}
	const d1 = calcCheckDigit(cnpj.slice(0, 12), FIRST_WEIGHTS);
	if (d1 !== Number(cnpj[12])) {
		return false;
	}
	const d2 = calcCheckDigit(cnpj.slice(0, 13), SECOND_WEIGHTS);
	return d2 === Number(cnpj[13]);
}
