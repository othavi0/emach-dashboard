import type { ShippingAddressSnapshot } from "../../data";

export const formatCurrency = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

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
