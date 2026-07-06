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
	uprightOnly?: boolean;
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

export interface PackOptions {
	/** Acréscimo externo por dimensão (cm) — parede/aba da caixa. Default 0. */
	boxPaddingCm?: number;
	/** Fração máxima do volume interno ocupável. Default 0.9. */
	fillFactor?: number;
}

// Default de PackOptions.fillFactor — fração máxima do volume interno ocupável.
const DEFAULT_FILL_FACTOR = 0.9;

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
	return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

function fitsByDims(item: QuoteItem, box: QuoteBox): boolean {
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

function unitVolume(u: QuoteItem): number {
	return u.lengthCm * u.widthCm * u.heightCm;
}

function footprint(u: QuoteItem): number {
	if (u.uprightOnly) {
		return u.lengthCm * u.widthCm;
	}
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
function fitsSet(
	units: QuoteItem[],
	box: QuoteBox,
	fillFactor: number
): boolean {
	let weight = box.tareWeightKg;
	let occupied = 0;
	for (const u of units) {
		if (!fitsByDims(u, box)) {
			return false;
		}
		weight += dispatchWeight(u);
		occupied += occupiedVolume(u, box);
	}
	return weight <= box.maxWeightKg && occupied <= boxVolume(box) * fillFactor;
}

function emitPackage(
	units: QuoteItem[],
	box: QuoteBox,
	paddingCm: number
): ShippingPackage {
	let weight = box.tareWeightKg;
	for (const u of units) {
		weight += dispatchWeight(u);
	}
	return {
		lengthCm: box.internalLengthCm + paddingCm,
		widthCm: box.internalWidthCm + paddingCm,
		heightCm: box.internalHeightCm + paddingCm,
		weightKg: weight,
		outOfCatalog: false,
	};
}

// Menor caixa (por volume) em que o conjunto inteiro cabe.
function smallestFittingBox(
	units: QuoteItem[],
	boxesAsc: QuoteBox[],
	fillFactor: number
): QuoteBox | undefined {
	return boxesAsc.find((box) => fitsSet(units, box, fillFactor));
}

interface PackBin {
	box: QuoteBox;
	units: QuoteItem[];
}

export function packItems(
	items: QuoteItem[],
	boxes: QuoteBox[],
	opts?: PackOptions
): ShippingPackage[] {
	const fillFactor = opts?.fillFactor ?? DEFAULT_FILL_FACTOR;
	const paddingCm = opts?.boxPaddingCm ?? 0;
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

	// Itens a consolidar, maiores volumes primeiro (first-fit-decreasing).
	const rest = units
		.filter((x) => !x.shipsInOwnBox)
		.sort((a, b) => unitVolume(b) - unitVolume(a));
	if (rest.length === 0) {
		return packages;
	}

	const boxesAsc = [...boxes].sort((a, b) => boxVolume(a) - boxVolume(b));

	// Cada bin conhece a MENOR caixa que serve pro seu conjunto, recalculada a
	// cada inserção — consolida no menor número de caixas E cota cada uma pelo
	// menor tamanho possível. Quando tudo cabe junto, converge pra 1 bin
	// (subconjunto de conjunto viável é viável na mesma caixa).
	const bins: PackBin[] = [];
	for (const u of rest) {
		const alone = smallestFittingBox([u], boxesAsc, fillFactor);
		if (!alone) {
			// Não cabe em NENHUMA caixa ativa → "a combinar".
			packages.push({
				lengthCm: u.lengthCm,
				widthCm: u.widthCm,
				heightCm: u.heightCm,
				weightKg: dispatchWeight(u),
				outOfCatalog: true,
			});
			continue;
		}
		let placed = false;
		for (const bin of bins) {
			const candidate = smallestFittingBox(
				[...bin.units, u],
				boxesAsc,
				fillFactor
			);
			if (candidate) {
				bin.units.push(u);
				bin.box = candidate;
				placed = true;
				break;
			}
		}
		if (!placed) {
			bins.push({ box: alone, units: [u] });
		}
	}
	for (const bin of bins) {
		packages.push(emitPackage(bin.units, bin.box, paddingCm));
	}

	return packages;
}
