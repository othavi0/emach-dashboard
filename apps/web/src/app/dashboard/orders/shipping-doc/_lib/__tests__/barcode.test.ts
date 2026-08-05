import { describe, expect, it } from "vitest";
import { cepBarcodeDataUri } from "../barcode";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const DATA_URI_PREFIX = /^data:image\/png;base64,/;

describe("cepBarcodeDataUri", () => {
	it("gera PNG data URI para CEP válido (com ou sem máscara)", async () => {
		const uri = await cepBarcodeDataUri("80050-450");
		expect(uri).toMatch(DATA_URI_PREFIX);
		const decoded = Buffer.from(
			(uri as string).replace("data:image/png;base64,", ""),
			"base64"
		);
		expect(decoded.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
	});

	it("devolve null para CEP ausente ou inválido", async () => {
		expect(await cepBarcodeDataUri(null)).toBeNull();
		expect(await cepBarcodeDataUri("")).toBeNull();
		expect(await cepBarcodeDataUri("1234")).toBeNull();
	});
});
