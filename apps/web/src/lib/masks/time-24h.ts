import type { Mask } from "./index";

const MAX_HOUR = 23;
const MAX_MINUTE = 59;

/**
 * Normaliza entrada para "HH:MM" 24h enquanto digita, com clamp de hora (00-23)
 * e minuto (00-59). Aceita parcial ("18", "18:3") durante a digitação.
 */
export function sanitizeTime24h(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, 4);
	if (digits.length === 0) {
		return "";
	}
	const hPart = digits.slice(0, 2);
	const mPart = digits.slice(2);
	const hh =
		hPart.length === 2
			? String(Math.min(MAX_HOUR, Number(hPart))).padStart(2, "0")
			: hPart;
	if (digits.length <= 2) {
		return hh;
	}
	const mm =
		mPart.length === 2
			? String(Math.min(MAX_MINUTE, Number(mPart))).padStart(2, "0")
			: mPart;
	return `${hh}:${mm}`;
}

export const time24hMask: Mask<string> = {
	format: (raw) => raw ?? "",
	parse: (display) => sanitizeTime24h(display) || undefined,
	sanitize: sanitizeTime24h,
	inputMode: "numeric",
	placeholder: "08:00",
	maxLength: 5,
};
