import { normalizeDocument } from "@/lib/cpf-cnpj";
import { formatCep } from "@/lib/format/branch";
import { formatPhone } from "@/lib/format/phone";

// Remetente = filial do pedido (endereço estruturado de `branch`).
export interface ShippingDocSender {
	cep: string | null;
	city: string | null;
	complement: string | null;
	name: string | null;
	neighborhood: string | null;
	phone: string | null;
	state: string | null;
	street: string | null;
	streetNumber: string | null;
}

// Destinatário = snapshot de entrega (`order.shippingAddress`) + contato do cliente.
export interface ShippingDocRecipient {
	city: string | null;
	complement: string | null;
	document: string | null; // CPF/CNPJ cru (só dígitos após normalização)
	name: string | null; // recipient do snapshot
	neighborhood: string | null;
	number: string | null;
	phone: string | null;
	state: string | null;
	street: string | null;
	zipCode: string | null;
}

export interface ShippingDocItem {
	lineTotal: number;
	name: string;
	quantity: number;
	unitPrice: number;
}

export interface ShippingDocOrder {
	id: string;
	items: ShippingDocItem[];
	number: string;
	recipient: ShippingDocRecipient;
	sender: ShippingDocSender;
	shippingMethod: string | null;
	shippingServiceCode: string | null;
}

export interface ContentDeclarationTotals {
	totalItems: number;
	totalQuantity: number;
	totalValue: number;
}

export const NO_CARRIER_LABEL = "Frete a combinar";

const BRL = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

/** Formata valor em Real (pt-BR). Reaproveitado na declaração de conteúdo. */
export function formatBRL(value: number): string {
	return BRL.format(value);
}

/** "Rua X, 123 — Apto 4" — número e complemento colados quando presentes. */
function streetLine(
	street: string | null,
	number: string | null,
	complement: string | null
): string | null {
	const base = street && number ? `${street}, ${number}` : street;
	if (!base) {
		return complement ?? null;
	}
	return complement ? `${base} — ${complement}` : base;
}

/** "Cidade/UF" — degrada para o que existir; null quando nenhum. */
function cityStateLine(
	city: string | null,
	state: string | null
): string | null {
	if (city && state) {
		return `${city}/${state}`;
	}
	return city ?? state ?? null;
}

/** Linhas de endereço do remetente (filial), campos ausentes omitidos sem "undefined". */
export function senderAddressLines(sender: ShippingDocSender): string[] {
	const cep = formatCep(sender.cep);
	return [
		streetLine(sender.street, sender.streetNumber, sender.complement),
		sender.neighborhood,
		cityStateLine(sender.city, sender.state),
		cep ? `CEP ${cep}` : null,
	].filter((line): line is string => Boolean(line));
}

/** Linhas de endereço do destinatário (snapshot), campos ausentes omitidos. */
export function recipientAddressLines(
	recipient: ShippingDocRecipient
): string[] {
	const cep = formatCep(recipient.zipCode);
	return [
		streetLine(recipient.street, recipient.number, recipient.complement),
		recipient.neighborhood,
		cityStateLine(recipient.city, recipient.state),
		cep ? `CEP ${cep}` : null,
	].filter((line): line is string => Boolean(line));
}

/** Telefone formatado ou null (nunca "" no documento). */
export function displayPhone(raw: string | null): string | null {
	const formatted = formatPhone(raw);
	return formatted ? formatted : null;
}

/**
 * Mascara CPF/CNPJ por padrão (LGPD, decisão do issue #321): expõe só os
 * blocos do meio, oculta prefixo e dígitos verificadores. Doc com tamanho
 * inesperado vira null (não vaza dígito cru na etiqueta).
 */
export function maskDocument(raw: string | null): string | null {
	const digits = normalizeDocument(raw);
	if (digits.length === 11) {
		return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
	}
	if (digits.length === 14) {
		return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`;
	}
	return null;
}

/** "Correios · SEDEX · COR-04162" — método e código de serviço quando ambos existem. */
export function formatCarrierService(
	method: string | null,
	serviceCode: string | null
): string {
	if (method && serviceCode) {
		return `${method} · ${serviceCode}`;
	}
	return method ?? serviceCode ?? NO_CARRIER_LABEL;
}

export function contentDeclarationTotals(
	items: ShippingDocItem[]
): ContentDeclarationTotals {
	let totalQuantity = 0;
	let totalValue = 0;
	for (const item of items) {
		totalQuantity += item.quantity;
		totalValue += item.lineTotal;
	}
	return { totalItems: items.length, totalQuantity, totalValue };
}
