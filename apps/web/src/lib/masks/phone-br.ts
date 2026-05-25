import type { Mask } from "./index";

const PHONE_DIGITS_MAX = 11;

function sanitizePhone(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, PHONE_DIGITS_MAX);
	if (digits.length === 0) {
		return "";
	}
	if (digits.length <= 2) {
		return `(${digits}`;
	}
	if (digits.length <= 6) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
	}
	if (digits.length <= 10) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
	}
	return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const phoneBrMask: Mask<string> = {
	format: (raw) => (raw ? sanitizePhone(raw) : ""),
	parse: (display) => {
		const digits = display.replace(/\D/g, "");
		return digits.length === 0 ? undefined : digits;
	},
	sanitize: sanitizePhone,
	inputMode: "numeric",
	placeholder: "(00) 00000-0000",
	maxLength: 16,
};
