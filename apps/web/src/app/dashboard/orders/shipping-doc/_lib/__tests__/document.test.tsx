import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { registerPdfFonts } from "../../../picking-list/_lib/fonts";
import { EmptyShippingDocDocument, ShippingDocDocument } from "../shipping-doc";
import type { ShippingDocOrder } from "../shipping-doc-logic";

const ORDERS: ShippingDocOrder[] = [
	{
		id: "o1",
		items: [
			{
				lineTotal: 899.9,
				name: "Lixadeira Telescópica Parede/Teto 750W MLP750 Menegotti",
				quantity: 1,
				unitPrice: 899.9,
			},
		],
		number: "#EM-2026-0142",
		recipient: {
			city: "Joinville",
			complement: "Apto 42",
			document: "39053344705",
			name: "Carlos Eduardo Ramos",
			neighborhood: "América",
			number: "88",
			phone: "47988887777",
			state: "SC",
			street: "Rua das Palmeiras",
			zipCode: "89201000",
		},
		sender: {
			cep: "80010000",
			city: "Curitiba",
			complement: null,
			name: "Filial Curitiba",
			neighborhood: "Centro",
			phone: "4133334444",
			state: "PR",
			street: "Rua XV de Novembro",
			streetNumber: "1200",
		},
		shippingMethod: "Correios · SEDEX",
		shippingServiceCode: "COR-04162",
	},
	{
		id: "o2",
		items: [
			{
				lineTotal: 240,
				name: "Balde Caçamba 50L",
				quantity: 2,
				unitPrice: 120,
			},
		],
		number: "#EM-2026-0139",
		recipient: {
			city: null,
			complement: null,
			document: null,
			name: "Cliente sem endereço completo",
			neighborhood: null,
			number: null,
			phone: null,
			state: null,
			street: null,
			zipCode: null,
		},
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
		shippingMethod: null,
		shippingServiceCode: null,
	},
];

describe("ShippingDocDocument", () => {
	it("renderiza PDF válido com 2 pedidos (uma folha cada)", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<ShippingDocDocument
				generatedAt={new Date("2026-07-15T17:32:00Z")}
				operatorName="Othavio"
				orders={ORDERS}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buf.length).toBeGreaterThan(2000);
	});

	it("renderiza pedido com campos ausentes sem quebrar (graceful)", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<ShippingDocDocument
				generatedAt={new Date("2026-07-15T17:32:00Z")}
				operatorName="Othavio"
				orders={[ORDERS[1] as ShippingDocOrder]}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("renderiza documento vazio", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<EmptyShippingDocDocument
				generatedAt={new Date("2026-07-15T17:32:00Z")}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});
});
