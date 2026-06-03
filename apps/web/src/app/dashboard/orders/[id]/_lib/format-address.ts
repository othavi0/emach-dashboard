import type { ShippingAddressSnapshot } from "../../data";

export const formatCurrency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const NON_DIGITS_RE = /\D/g;
const CPF_MASK_RE = /(\d{3})(\d{3})(\d{3})(\d{2})/;
const CNPJ_MASK_RE = /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/;

/** Mascara CPF (11 díg.) ou CNPJ (14 díg.); devolve "—" quando vazio, ou o valor cru se não casar. */
export function formatDocument(doc: string | null): string {
	if (!doc) {
		return "—";
	}
	const digits = doc.replace(NON_DIGITS_RE, "");
	if (digits.length === 11) {
		return digits.replace(CPF_MASK_RE, "$1.$2.$3-$4");
	}
	if (digits.length === 14) {
		return digits.replace(CNPJ_MASK_RE, "$1.$2.$3/$4-$5");
	}
	return doc;
}

export function formatAddress(address: ShippingAddressSnapshot): string[] {
	const line1 = [address.street, address.number].filter(Boolean).join(", ");
	const line2 = [
		address.neighborhood,
		[address.city, address.state].filter(Boolean).join(" - "),
	]
		.filter(Boolean)
		.join(" · ");
	const line3 = [address.zipCode, address.country].filter(Boolean).join(" · ");
	return [address.recipient, line1, line2, line3].filter(Boolean) as string[];
}
