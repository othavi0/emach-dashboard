import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { EmptyPickingListDocument, PickingListDocument } from "../document";
import { registerPdfFonts } from "../fonts";
import type { PickingListOrder } from "../picking-list-logic";

const ORDERS: PickingListOrder[] = [
	{
		city: "Curitiba",
		clientName: "Marcos Vinícius Almeida",
		id: "o1",
		items: [
			{
				barcode: "7891234567890",
				model: "MLP750",
				name: "Lixadeira Telescópica Parede/Teto 750W MLP750 Menegotti",
				quantity: 1,
				sku: "750LED-127",
				variantId: "v1",
				voltage: "127V",
			},
		],
		number: "#EM-2026-0142",
		shippingMethod: "Correios · SEDEX",
		state: "PR",
	},
	{
		city: "Joinville",
		clientName: "Carlos Eduardo Ramos",
		id: "o2",
		items: [
			{
				barcode: null,
				model: null,
				name: "Balde Caçamba 50L Menegotti",
				quantity: 2,
				sku: "BALDE50L",
				variantId: "v2",
				voltage: null,
			},
		],
		number: "#EM-2026-0139",
		shippingMethod: null,
		state: "SC",
	},
];

describe("PickingListDocument", () => {
	it("renderiza PDF válido com 2 pedidos (com seção de coleta)", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<PickingListDocument
				batch="L-1507-1432"
				branchName="Curitiba"
				generatedAt={new Date("2026-07-15T17:32:00Z")}
				operatorName="Othavio"
				orders={ORDERS}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buf.length).toBeGreaterThan(2000);
	});

	it("renderiza documento vazio", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<EmptyPickingListDocument batch="L-1507-1432" />
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});
});
