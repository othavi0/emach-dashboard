import bwipjs from "bwip-js/node";

const CEP_DIGITS = /^\d{8}$/;

/**
 * Code 128 do CEP (padrão de triagem dos Correios) como PNG data URI para o
 * <Image> do react-pdf. Null quando não há CEP utilizável — a etiqueta sai sem
 * barcode, nunca com barcode de dado errado.
 */
export async function cepBarcodeDataUri(
	cep: string | null
): Promise<string | null> {
	const digits = (cep ?? "").replace(/\D/g, "");
	if (!CEP_DIGITS.test(digits)) {
		return null;
	}
	const png = await bwipjs.toBuffer({
		bcid: "code128",
		text: digits,
		scale: 3,
		height: 8,
		includetext: false,
	});
	return `data:image/png;base64,${png.toString("base64")}`;
}
