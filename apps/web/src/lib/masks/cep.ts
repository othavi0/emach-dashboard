import type { Mask } from "./index";

const CEP_DIGITS = 8;

function sanitizeCep(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, CEP_DIGITS);
	if (digits.length <= 5) {
		return digits;
	}
	return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export const cepMask: Mask<string> = {
	format: (raw) => (raw ? sanitizeCep(raw) : ""),
	parse: (display) => {
		const digits = display.replace(/\D/g, "");
		return digits.length === 0 ? undefined : digits;
	},
	sanitize: sanitizeCep,
	inputMode: "numeric",
	placeholder: "00000-000",
	maxLength: 9,
};
