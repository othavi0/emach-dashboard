import { normalizeDocument } from "@/lib/cpf-cnpj";
import type { Mask } from "./index";

const CNPJ_CHARS_MAX = 14;
const CNPJ_A_RE = /^([0-9A-Z]{2})([0-9A-Z])/;
const CNPJ_B_RE = /^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/;
const CNPJ_C_RE = /\.([0-9A-Z]{3})([0-9A-Z])/;
const CNPJ_D_RE = /([0-9A-Z]{4})([0-9A-Z])/;

// Mesma máscara do `maskCpfCnpj` do ecommerce: CNPJ alfanumérico (IN RFB
// 2.229/2024) mantém letras em maiúsculas.
function sanitizeCnpj(display: string): string {
	return normalizeDocument(display)
		.slice(0, CNPJ_CHARS_MAX)
		.replace(CNPJ_A_RE, "$1.$2")
		.replace(CNPJ_B_RE, "$1.$2.$3")
		.replace(CNPJ_C_RE, ".$1/$2")
		.replace(CNPJ_D_RE, "$1-$2");
}

export const cnpjMask: Mask<string> = {
	format: (raw) => (raw ? sanitizeCnpj(raw) : ""),
	parse: (display) => {
		const cnpj = normalizeDocument(display).slice(0, CNPJ_CHARS_MAX);

		return cnpj.length === 0 ? undefined : cnpj;
	},
	sanitize: sanitizeCnpj,
	inputMode: "text",
	placeholder: "00.000.000/0000-00",
	maxLength: 18,
};
