import type { Mask } from "./index";

const CNPJ_DIGITS_MAX = 14;

function sanitizeCnpj(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, CNPJ_DIGITS_MAX);
	if (digits.length === 0) {
		return "";
	}
	if (digits.length <= 2) {
		return digits;
	}
	if (digits.length <= 5) {
		return `${digits.slice(0, 2)}.${digits.slice(2)}`;
	}
	if (digits.length <= 8) {
		return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
	}
	if (digits.length <= 12) {
		return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
	}
	return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export const cnpjMask: Mask<string> = {
	format: (raw) => (raw ? sanitizeCnpj(raw) : ""),
	parse: (display) => {
		const digits = display.replace(/\D/g, "");
		return digits.length === 0 ? undefined : digits;
	},
	sanitize: sanitizeCnpj,
	inputMode: "numeric",
	placeholder: "00.000.000/0000-00",
	maxLength: 18,
};
