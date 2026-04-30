import type { Mask } from "./index";

const HS_DIGITS = 10;

function sanitizeHs(display: string): string {
	return display.replace(/\D/g, "").slice(0, HS_DIGITS);
}

export const hsCodeMask: Mask<string> = {
	format: (raw) => raw ?? "",
	parse: (display) => {
		const cleaned = sanitizeHs(display);
		return cleaned ? cleaned : undefined;
	},
	sanitize: sanitizeHs,
	inputMode: "numeric",
	placeholder: "0000000000",
	maxLength: HS_DIGITS,
};
