import type { QuoteBox } from "@emach/db/queries/shipping-quote";

// Espelho client-safe da regra POR UNIDADE de packItems
// (packages/db/src/queries/shipping-quote.ts: fitsByDims + fitsSet +
// occupiedVolume). Duplicado porque Client Component não pode importar
// runtime de @emach/db. Mudou lá → mudar aqui (testes espelham os do motor).
const FILL_FACTOR = 0.9;

export interface FitCheckItem {
	heightCm: number;
	lengthCm: number;
	packagingWeightKg: number;
	stackable: boolean;
	uprightOnly?: boolean;
	weightKg: number;
	widthCm: number;
}

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
	return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

function fitsByDims(item: FitCheckItem, box: QuoteBox): boolean {
	if (item.uprightOnly) {
		// Altura fixa: só as horizontais podem trocar entre si.
		if (item.heightCm > box.internalHeightCm) {
			return false;
		}
		const iMax = Math.max(item.lengthCm, item.widthCm);
		const iMin = Math.min(item.lengthCm, item.widthCm);
		const bMax = Math.max(box.internalLengthCm, box.internalWidthCm);
		const bMin = Math.min(box.internalLengthCm, box.internalWidthCm);
		return iMax <= bMax && iMin <= bMin;
	}
	const i = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	const b = sortedDesc(
		box.internalLengthCm,
		box.internalWidthCm,
		box.internalHeightCm
	);
	return i[0] <= b[0] && i[1] <= b[1] && i[2] <= b[2];
}

function footprint(item: FitCheckItem): number {
	if (item.uprightOnly) {
		return item.lengthCm * item.widthCm;
	}
	const s = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	return s[0] * s[1];
}

function fitsShippingBox(
	item: FitCheckItem,
	box: QuoteBox,
	fillFactor: number
): boolean {
	if (!fitsByDims(item, box)) {
		return false;
	}
	const weight = box.tareWeightKg + item.weightKg + item.packagingWeightKg;
	if (weight > box.maxWeightKg) {
		return false;
	}
	const unitVolume = item.lengthCm * item.widthCm * item.heightCm;
	// Não-empilhável reserva a coluna inteira acima dele (footprint × altura).
	const occupied = item.stackable
		? unitVolume
		: footprint(item) * box.internalHeightCm;
	const boxVolume =
		box.internalLengthCm * box.internalWidthCm * box.internalHeightCm;
	return occupied <= boxVolume * fillFactor;
}

/** true se a unidade cabe em ALGUMA caixa ativa — mesma regra do checkout. */
export function fitsAnyActiveBox(
	item: FitCheckItem,
	boxes: QuoteBox[],
	fillFactor: number = FILL_FACTOR
): boolean {
	return boxes.some((box) => fitsShippingBox(item, box, fillFactor));
}
