// Motor de cotação de frete — funções PURAS (sem DB, sem server-only).
// Vive em queries/ p/ sincronizar ao ecommerce via CI (ADR-0009).
// Consumido pelo storefront (checkout) e pelo preview do dashboard.

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

export interface QuoteRate {
	baseAmount: number;
	perKgAmount: number;
	weightFromKg: number;
	weightToKg: number | null; // null = ∞
}

export interface QuoteZone {
	cepRanges: { from: string; to: string }[];
	deliveryDays: number | null;
	minFreightAmount: number | null;
	rates: QuoteRate[];
}

export interface QuoteCarrier {
	advaloremPercent: number | null;
	cubageDivisor: number;
	grisMinAmount: number | null;
	grisPercent: number | null;
	icmsPercent: number | null;
	id: string;
	name: string;
	tollAmount: number | null;
	zones: QuoteZone[];
}

export type UnquotableReason = "no_zone" | "no_rate" | "out_of_catalog";

export interface QuoteResult {
	options: {
		carrierId: string;
		carrierName: string;
		amount: number;
		deliveryDays: number | null;
	}[];
	unquotable: {
		carrierId: string;
		carrierName: string;
		reason: UnquotableReason;
	}[];
}

function onlyDigits(cep: string): string {
	return cep.replace(/\D/g, "");
}

// CEPs normalizados a 8 dígitos → comparação léxica equivale a numérica.
export function matchCepRange(
	cep: string,
	ranges: { from: string; to: string }[]
): boolean {
	const c = onlyDigits(cep);
	return ranges.some((r) => {
		const from = onlyDigits(r.from);
		const to = onlyDigits(r.to);
		return c >= from && c <= to;
	});
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cotação multi-transportadora com fallbacks — refatorar em issue separada
export function quoteShipping(input: {
	items: QuoteItem[];
	destinationCep: string;
	declaredValue: number;
	carriers: QuoteCarrier[];
	boxes: QuoteBox[];
}): QuoteResult {
	const packages = packItems(input.items, input.boxes);
	const cep = onlyDigits(input.destinationCep);
	const hasOutOfCatalog = packages.some((p) => p.outOfCatalog);

	const options: QuoteResult["options"] = [];
	const unquotable: QuoteResult["unquotable"] = [];

	for (const carrier of input.carriers) {
		const zone = carrier.zones.find((z) => matchCepRange(cep, z.cepRanges));
		if (!zone) {
			unquotable.push({
				carrierId: carrier.id,
				carrierName: carrier.name,
				reason: "no_zone",
			});
			continue;
		}
		if (hasOutOfCatalog) {
			unquotable.push({
				carrierId: carrier.id,
				carrierName: carrier.name,
				reason: "out_of_catalog",
			});
			continue;
		}

		let fretePeso = 0;
		let failed = false;
		for (const pkg of packages) {
			const cubado =
				(pkg.lengthCm * pkg.widthCm * pkg.heightCm) / carrier.cubageDivisor;
			const peso = Math.max(pkg.weightKg, cubado);
			const rate = zone.rates.find(
				(r) =>
					peso >= r.weightFromKg &&
					(r.weightToKg === null || peso < r.weightToKg)
			);
			if (!rate) {
				failed = true;
				break;
			}
			fretePeso +=
				rate.baseAmount +
				Math.max(0, peso - rate.weightFromKg) * rate.perKgAmount;
		}
		if (failed) {
			unquotable.push({
				carrierId: carrier.id,
				carrierName: carrier.name,
				reason: "no_rate",
			});
			continue;
		}

		fretePeso = Math.max(fretePeso, zone.minFreightAmount ?? 0);

		let subtotal = fretePeso;
		if (carrier.grisPercent != null) {
			subtotal += Math.max(
				(input.declaredValue * carrier.grisPercent) / 100,
				carrier.grisMinAmount ?? 0
			);
		}
		if (carrier.advaloremPercent != null) {
			subtotal += (input.declaredValue * carrier.advaloremPercent) / 100;
		}
		if (carrier.tollAmount != null) {
			subtotal += carrier.tollAmount;
		}

		let total = subtotal;
		if (carrier.icmsPercent != null && carrier.icmsPercent > 0) {
			total = subtotal / (1 - carrier.icmsPercent / 100); // ICMS "por dentro"
		}

		options.push({
			carrierId: carrier.id,
			carrierName: carrier.name,
			amount: round2(total),
			deliveryDays: zone.deliveryDays,
		});
	}

	options.sort((a, b) => a.amount - b.amount);
	return { options, unquotable };
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
