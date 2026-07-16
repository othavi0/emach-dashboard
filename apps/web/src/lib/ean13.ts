// Encoder EAN-13 (ISO/IEC 15420): 95 módulos = guard 101 + 6 dígitos L/G
// (paridade pelo 1º dígito) + guard 01010 + 6 dígitos R + guard 101.

const L_CODES = [
	"0001101",
	"0011001",
	"0010011",
	"0111101",
	"0100011",
	"0110001",
	"0101111",
	"0111011",
	"0110111",
	"0001011",
] as const;

const G_CODES = [
	"0100111",
	"0110011",
	"0011011",
	"0100001",
	"0011101",
	"0111001",
	"0000101",
	"0010001",
	"0001001",
	"0010111",
] as const;

const R_CODES = [
	"1110010",
	"1100110",
	"1101100",
	"1000010",
	"1011100",
	"1001110",
	"1010000",
	"1000100",
	"1001000",
	"1110100",
] as const;

const PARITY_BY_FIRST_DIGIT = [
	"LLLLLL",
	"LLGLGG",
	"LLGGLG",
	"LLGGGL",
	"LGLLGG",
	"LGGLLG",
	"LGGGLL",
	"LGLGLG",
	"LGLGGL",
	"LGGLGL",
] as const;

const EAN13_PATTERN = /^\d{13}$/;

export function isValidEan13(code: string): boolean {
	if (!EAN13_PATTERN.test(code)) {
		return false;
	}
	const digits = Array.from(code, Number);
	let sum = 0;
	for (const [i, d] of digits.slice(0, 12).entries()) {
		sum += d * (i % 2 === 0 ? 1 : 3);
	}
	return (10 - (sum % 10)) % 10 === digits[12];
}

export function ean13Modules(code: string): string {
	if (!isValidEan13(code)) {
		throw new Error(`EAN-13 inválido: ${code}`);
	}
	const digits = Array.from(code, Number);
	const parity = PARITY_BY_FIRST_DIGIT[digits[0] ?? 0] ?? "LLLLLL";
	let bits = "101";
	for (let i = 1; i <= 6; i++) {
		const table = parity[i - 1] === "L" ? L_CODES : G_CODES;
		bits += table[digits[i] ?? 0];
	}
	bits += "01010";
	for (let i = 7; i <= 12; i++) {
		bits += R_CODES[digits[i] ?? 0];
	}
	return `${bits}101`;
}

export interface Ean13Bar {
	w: number;
	x: number;
}

export function ean13Bars(code: string): Ean13Bar[] {
	const modules = ean13Modules(code);
	const bars: Ean13Bar[] = [];
	let start = -1;
	for (let i = 0; i <= modules.length; i++) {
		const on = i < modules.length && modules[i] === "1";
		if (on && start < 0) {
			start = i;
		} else if (!on && start >= 0) {
			bars.push({ x: start, w: i - start });
			start = -1;
		}
	}
	return bars;
}
