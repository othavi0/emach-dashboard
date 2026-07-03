// Consolidação do carrinho em caixas — funções PURAS (sem DB, sem server-only).
// Vive em queries/ p/ sincronizar ao ecommerce via CI (ADR-0009).
// Consumido pelo checkout do storefront: cada pacote de packItems vira uma
// linha do ShippingItemArray na cotação Frenet; pacote outOfCatalog → "a
// combinar" (sem chamar a API).

export interface QuoteItem {
	heightCm: number;
	lengthCm: number;
	packagingWeightKg: number;
	qty: number;
	shipsInOwnBox: boolean;
	stackable: boolean;
	weightKg: number;
	widthCm: number;
}

export interface QuoteBox {
	id: string;
	internalHeightCm: number;
	internalLengthCm: number;
	internalWidthCm: number;
	maxWeightKg: number;
	tareWeightKg: number;
}

export interface ShippingPackage {
	heightCm: number;
	lengthCm: number;
	outOfCatalog: boolean;
	weightKg: number;
	widthCm: number;
}

// Folga de empacotamento: itens nunca preenchem 100% do volume interno.
const FILL_FACTOR = 0.9;

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
	return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

function fitsByDims(item: QuoteItem, box: QuoteBox): boolean {
	const i = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	const b = sortedDesc(
		box.internalLengthCm,
		box.internalWidthCm,
		box.internalHeightCm
	);
	return i[0] <= b[0] && i[1] <= b[1] && i[2] <= b[2];
}

function unitVolume(u: QuoteItem): number {
	return u.lengthCm * u.widthCm * u.heightCm;
}

function footprint(u: QuoteItem): number {
	const s = sortedDesc(u.lengthCm, u.widthCm, u.heightCm);
	return s[0] * s[1];
}

// Item não-empilhável reserva a coluna acima dele (footprint × altura da caixa).
function occupiedVolume(u: QuoteItem, box: QuoteBox): number {
	return u.stackable ? unitVolume(u) : footprint(u) * box.internalHeightCm;
}

function boxVolume(b: QuoteBox): number {
	return b.internalLengthCm * b.internalWidthCm * b.internalHeightCm;
}

function dispatchWeight(u: QuoteItem): number {
	return u.weightKg + u.packagingWeightKg;
}

// Um conjunto de unidades cabe numa caixa se: cada unidade cabe por eixo
// (com rotação), o peso total (+ tara) ≤ máximo, e o volume ocupado total ≤
// volume interno × fator de folga.
function fitsSet(units: QuoteItem[], box: QuoteBox): boolean {
	let weight = box.tareWeightKg;
	let occupied = 0;
	for (const u of units) {
		if (!fitsByDims(u, box)) {
			return false;
		}
		weight += dispatchWeight(u);
		occupied += occupiedVolume(u, box);
	}
	return weight <= box.maxWeightKg && occupied <= boxVolume(box) * FILL_FACTOR;
}

function emitPackage(units: QuoteItem[], box: QuoteBox): ShippingPackage {
	let weight = box.tareWeightKg;
	for (const u of units) {
		weight += dispatchWeight(u);
	}
	return {
		lengthCm: box.internalLengthCm,
		widthCm: box.internalWidthCm,
		heightCm: box.internalHeightCm,
		weightKg: weight,
		outOfCatalog: false,
	};
}

export function packItems(
	items: QuoteItem[],
	boxes: QuoteBox[]
): ShippingPackage[] {
	const packages: ShippingPackage[] = [];

	// Expande qty em unidades.
	const units: QuoteItem[] = [];
	for (const it of items) {
		for (let i = 0; i < it.qty; i++) {
			units.push({ ...it, qty: 1 });
		}
	}

	// shipsInOwnBox → cada unidade é seu próprio pacote (usa as próprias dims).
	for (const u of units.filter((x) => x.shipsInOwnBox)) {
		packages.push({
			lengthCm: u.lengthCm,
			widthCm: u.widthCm,
			heightCm: u.heightCm,
			weightKg: dispatchWeight(u),
			outOfCatalog: false,
		});
	}

	// Itens a consolidar, maiores volumes primeiro.
	const rest = units
		.filter((x) => !x.shipsInOwnBox)
		.sort((a, b) => unitVolume(b) - unitVolume(a));
	if (rest.length === 0) {
		return packages;
	}

	const boxesAsc = [...boxes].sort((a, b) => boxVolume(a) - boxVolume(b));

	// Consolidação: a MENOR caixa única que cabe TODOS os itens → 1 pacote.
	// (É o que evita cobrar N× — ex: 4 furadeiras numa box-xl em vez de 4 box-s.)
	const single = boxesAsc.find((box) => fitsSet(rest, box));
	if (single) {
		packages.push(emitPackage(rest, single));
		return packages;
	}

	// Nenhuma caixa única cabe tudo → multi-caixa, enchendo a MAIOR caixa por
	// bin (máxima consolidação). Unidade grande/pesada demais até pra maior
	// caixa → pacote próprio marcado out_of_catalog ("a combinar").
	const largest = boxesAsc.at(-1);
	if (!largest) {
		// Sem catálogo de caixas → tudo "a combinar".
		for (const u of rest) {
			packages.push({
				lengthCm: u.lengthCm,
				widthCm: u.widthCm,
				heightCm: u.heightCm,
				weightKg: dispatchWeight(u),
				outOfCatalog: true,
			});
		}
		return packages;
	}
	const bins: QuoteItem[][] = [];
	for (const u of rest) {
		if (!fitsSet([u], largest)) {
			packages.push({
				lengthCm: u.lengthCm,
				widthCm: u.widthCm,
				heightCm: u.heightCm,
				weightKg: dispatchWeight(u),
				outOfCatalog: true,
			});
			continue;
		}
		const bin = bins.find((b) => fitsSet([...b, u], largest));
		if (bin) {
			bin.push(u);
		} else {
			bins.push([u]);
		}
	}
	for (const bin of bins) {
		packages.push(emitPackage(bin, largest));
	}

	return packages;
}
