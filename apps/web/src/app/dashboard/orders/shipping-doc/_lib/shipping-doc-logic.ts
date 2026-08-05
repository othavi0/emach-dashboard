import { formatCep } from "@/lib/format/branch";

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
	name: string;
	quantity: number;
	sku: string | null;
	voltage: string | null;
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

/** Régua da metade: acima disso o pedido ganha folha exclusiva (spec D2). */
export const MAX_ITEMS_PER_HALF = 8;

export type LabelSheet =
	| { kind: "pair"; top: ShippingDocOrder; bottom: ShippingDocOrder | null }
	| { kind: "full"; order: ShippingDocOrder };

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

/**
 * 2 etiquetas por A4: pedidos com até MAX_ITEMS_PER_HALF itens pareiam em
 * ordem; maiores saem primeiro em folha exclusiva. Lote ímpar deixa a última
 * metade em branco (bottom null).
 */
export function paginateLabels(orders: ShippingDocOrder[]): LabelSheet[] {
	const sheets: LabelSheet[] = [];
	const halves: ShippingDocOrder[] = [];
	for (const order of orders) {
		if (order.items.length > MAX_ITEMS_PER_HALF) {
			sheets.push({ kind: "full", order });
		} else {
			halves.push(order);
		}
	}
	for (let i = 0; i < halves.length; i += 2) {
		const top = halves[i];
		if (!top) {
			break;
		}
		sheets.push({ kind: "pair", top, bottom: halves[i + 1] ?? null });
	}
	return sheets;
}

export function labelRecipientLines(r: ShippingDocRecipient): {
	cep: string | null;
	locality: string | null;
	street: string | null;
} {
	const cep = formatCep(r.zipCode);
	return {
		cep: cep || null,
		locality:
			[r.neighborhood, cityStateLine(r.city, r.state)]
				.filter(Boolean)
				.join(" · ") || null,
		street: streetLine(r.street, r.number, r.complement),
	};
}

/** Endereço da filial em linha única — remetente compacto da etiqueta. */
export function senderInline(s: ShippingDocSender): string | null {
	const cep = formatCep(s.cep);
	const line = [
		streetLine(s.street, s.streetNumber, s.complement),
		s.neighborhood,
		cityStateLine(s.city, s.state),
		cep ? `CEP ${cep}` : null,
	]
		.filter(Boolean)
		.join(" · ");
	return line || null;
}

export function itemsSummary(items: ShippingDocItem[]): string {
	const units = items.reduce((sum, i) => sum + i.quantity, 0);
	const itemWord = items.length === 1 ? "item" : "itens";
	return `${items.length} ${itemWord} · ${units} un.`;
}
