import { describe, expect, it } from "vitest";
import {
	itemsSummary,
	labelRecipientLines,
	paginateLabels,
	type ShippingDocItem,
	type ShippingDocOrder,
	senderInline,
} from "../shipping-doc-logic";

function makeItem(n: number): ShippingDocItem {
	return { name: `Item ${n}`, quantity: 1, sku: null, voltage: null };
}

function makeOrder(id: string, itemCount: number): ShippingDocOrder {
	return {
		id,
		number: `EM-${id}`,
		items: Array.from({ length: itemCount }, (_, i) => makeItem(i)),
		recipient: {
			city: "Curitiba",
			complement: "apt 02",
			document: null,
			name: "Othavio Quiliao",
			neighborhood: "Cristo Rei",
			number: "106",
			phone: null,
			state: "PR",
			street: "Rua Oyapock",
			zipCode: "80050450",
		},
		sender: {
			cep: "88336310",
			city: "Balneário Camboriú",
			complement: "Loja Pinheiro",
			name: "Balneário Camboriú",
			neighborhood: "Nova Esperança",
			phone: null,
			state: "SC",
			street: "Rua Pascoal Moreira Cabral Leme",
			streetNumber: "64",
		},
		shippingMethod: "PAC",
		shippingServiceCode: null,
	};
}

describe("paginateLabels", () => {
	it("pareia pedidos pequenos 2 por folha, ímpar deixa bottom null", () => {
		const sheets = paginateLabels([
			makeOrder("a", 2),
			makeOrder("b", 3),
			makeOrder("c", 1),
		]);
		expect(sheets).toHaveLength(2);
		expect(sheets[0]).toMatchObject({ kind: "pair" });
		expect(sheets[1]).toMatchObject({ kind: "pair", bottom: null });
	});

	it("pedido com mais de 8 itens ganha folha exclusiva, preservando ordem", () => {
		const sheets = paginateLabels([
			makeOrder("a", 2),
			makeOrder("big", 9),
			makeOrder("c", 1),
		]);
		expect(sheets.map((s) => s.kind)).toEqual(["full", "pair"]);
		const pair = sheets[1];
		if (pair?.kind !== "pair") {
			throw new Error("esperava pair");
		}
		expect(pair.top.id).toBe("a");
		expect(pair.bottom?.id).toBe("c");
	});

	it("lista vazia devolve zero folhas", () => {
		expect(paginateLabels([])).toEqual([]);
	});
});

describe("labelRecipientLines", () => {
	it("monta street, locality e cep formatado", () => {
		const lines = labelRecipientLines(makeOrder("a", 1).recipient);
		expect(lines.street).toBe("Rua Oyapock, 106 — apt 02");
		expect(lines.locality).toBe("Cristo Rei · Curitiba/PR");
		expect(lines.cep).toBe("80050-450");
	});

	it("degrada com campos ausentes sem 'undefined'", () => {
		const lines = labelRecipientLines({
			city: null,
			complement: null,
			document: null,
			name: null,
			neighborhood: null,
			number: null,
			phone: null,
			state: "PR",
			street: null,
			zipCode: null,
		});
		expect(lines.street).toBeNull();
		expect(lines.locality).toBe("PR");
		expect(lines.cep).toBeNull();
	});
});

describe("senderInline", () => {
	it("linha única com separador ·", () => {
		expect(senderInline(makeOrder("a", 1).sender)).toBe(
			"Rua Pascoal Moreira Cabral Leme, 64 — Loja Pinheiro · Nova Esperança · Balneário Camboriú/SC · CEP 88336-310"
		);
	});

	it("null quando não há nenhum campo", () => {
		expect(
			senderInline({
				cep: null,
				city: null,
				complement: null,
				name: null,
				neighborhood: null,
				phone: null,
				state: null,
				street: null,
				streetNumber: null,
			})
		).toBeNull();
	});
});

describe("itemsSummary", () => {
	it("plural e soma de unidades", () => {
		const items = [
			{ name: "A", quantity: 2, sku: null, voltage: null },
			{ name: "B", quantity: 3, sku: null, voltage: null },
		];
		expect(itemsSummary(items)).toBe("2 itens · 5 un.");
	});
	it("singular", () => {
		expect(
			itemsSummary([{ name: "A", quantity: 1, sku: null, voltage: null }])
		).toBe("1 item · 1 un.");
	});
});
