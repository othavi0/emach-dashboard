import type { Mask } from "./index";

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function digitsOf(display: string): string {
	return display.replace(/\D/g, "");
}

function formatBRL(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return BRL.format(raw);
}

function parseBRL(display: string): number | undefined {
	const digits = digitsOf(display);
	if (!digits) {
		return;
	}
	return Number(digits) / 100;
}

function sanitizeBRL(display: string): string {
	const digits = digitsOf(display);
	if (!digits) {
		return "";
	}
	return BRL.format(Number(digits) / 100);
}

export const brlMask: Mask<number> = {
	format: formatBRL,
	parse: parseBRL,
	sanitize: sanitizeBRL,
	inputMode: "numeric",
	placeholder: "R$ 0,00",
};
