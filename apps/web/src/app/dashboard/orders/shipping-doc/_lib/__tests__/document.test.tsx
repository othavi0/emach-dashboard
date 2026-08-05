import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { registerPdfFonts } from "../../../picking-list/_lib/fonts";
import { EmptyShippingDocDocument, ShippingDocDocument } from "../shipping-doc";
import type { ShippingDocOrder } from "../shipping-doc-logic";

function order(id: string, itemCount: number): ShippingDocOrder {
	return {
		id,
		number: `EM-TEST-91${id}`,
		items: Array.from({ length: itemCount }, (_, i) => ({
			name: `Desempenadeira Elétrica ${i}`,
			quantity: 1,
			sku: `SKU-${i}`,
			voltage: i % 2 === 0 ? "127V" : "220V",
		})),
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
			complement: null,
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

const EMPTY_RECIPIENT = {
	city: null,
	complement: null,
	document: null,
	name: null,
	neighborhood: null,
	number: null,
	phone: null,
	state: null,
	street: null,
	zipCode: null,
};

// PNG 1x1 transparente válido — evita depender do bwip-js no teste do documento.
const TINY_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("ShippingDocDocument", () => {
	it("renderiza PDF válido com 3 pedidos pequenos (2 folhas) e barcode", async () => {
		registerPdfFonts();
		const orders = [order("01", 2), order("02", 4), order("03", 1)];
		const buf = await renderToBuffer(
			<ShippingDocDocument
				cepBarcodes={{ "01": TINY_PNG, "02": TINY_PNG, "03": TINY_PNG }}
				orders={orders}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buf.length).toBeGreaterThan(2000);
		// Regressão: 3 pedidos pequenos pareiam em 2 folhas — nenhuma delas pode
		// transbordar pra uma página fantasma de continuação (fix round 1, F2).
		const pageCount = (
			buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []
		).length;
		expect(pageCount).toBe(2);
	});

	it("pedido grande (9 itens) e campos ausentes renderizam sem quebrar", async () => {
		registerPdfFonts();
		const big = order("04", 9);
		const bare: ShippingDocOrder = {
			...order("05", 1),
			recipient: EMPTY_RECIPIENT,
			sender: {
				cep: null,
				city: null,
				complement: null,
				name: null,
				neighborhood: null,
				phone: null,
				state: null,
				street: null,
				streetNumber: null,
			},
		};
		const buf = await renderToBuffer(
			<ShippingDocDocument cepBarcodes={{}} orders={[big, bare]} />
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("renderiza documento vazio", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(<EmptyShippingDocDocument />);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});
});
