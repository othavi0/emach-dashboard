import type { Mask } from "./index";

const NCM_DIGITS = 8;

function sanitizeNcm(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, NCM_DIGITS);
	if (digits.length <= 4) {
		return digits;
	}
	if (digits.length <= 6) {
		return `${digits.slice(0, 4)}.${digits.slice(4)}`;
	}
	return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

export const ncmMask: Mask<string> = {
	format: (raw) => raw ?? "",
	parse: (display) => {
		const cleaned = sanitizeNcm(display);
		return cleaned ? cleaned : undefined;
	},
	sanitize: sanitizeNcm,
	inputMode: "numeric",
	placeholder: "0000.00.00",
	maxLength: 10,
};
