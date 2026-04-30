import type { Mask } from "./index";

const CEST_DIGITS = 7;

function sanitizeCest(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, CEST_DIGITS);
	if (digits.length <= 2) {
		return digits;
	}
	if (digits.length <= 5) {
		return `${digits.slice(0, 2)}.${digits.slice(2)}`;
	}
	return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
}

export const cestMask: Mask<string> = {
	format: (raw) => raw ?? "",
	parse: (display) => {
		const cleaned = sanitizeCest(display);
		return cleaned ? cleaned : undefined;
	},
	sanitize: sanitizeCest,
	inputMode: "numeric",
	placeholder: "00.000.00",
	maxLength: 9,
};
