import { describe, expect, it } from "vitest";
import {
	matchCepRange,
	packItems,
	type QuoteBox,
	type QuoteCarrier,
	type QuoteItem,
	quoteShipping,
} from "../shipping-quote";

const FURADEIRA: QuoteItem = {
	lengthCm: 35,
	widthCm: 30,
	heightCm: 28,
	weightKg: 15,
	packagingWeightKg: 2,
	stackable: false,
	shipsInOwnBox: false,
	qty: 1,
};

const BOXES: QuoteBox[] = [
	{
		id: "box-s",
		internalLengthCm: 35,
		internalWidthCm: 35,
		internalHeightCm: 30,
		maxWeightKg: 20,
		tareWeightKg: 0.5,
	},
	{
		id: "box-l",
		internalLengthCm: 70,
		internalWidthCm: 60,
		internalHeightCm: 50,
		maxWeightKg: 60,
		tareWeightKg: 1.2,
	},
	{
		id: "box-xl",
		internalLengthCm: 90,
		internalWidthCm: 70,
		internalHeightCm: 60,
		maxWeightKg: 80,
		tareWeightKg: 1.8,
	},
];

describe("packItems", () => {
	it("1 furadeira → 1 pacote (caixa pequena), peso = produto + embalagem + tara", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 1 }], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.weightKg).toBeCloseTo(17.5, 3); // 15 + 2 + 0.5 (box-s)
		expect(pkgs[0]?.outOfCatalog).toBe(false);
	});

	it("4 furadeiras → 1 pacote consolidado (não 4)", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 4 }], BOXES);
		expect(pkgs).toHaveLength(1);
		// 4×17 = 68kg + tara box-xl 1.8 = 69.8 (box-l estoura 60kg)
		expect(pkgs[0]?.weightKg).toBeCloseTo(69.8, 3);
		expect(pkgs[0]?.lengthCm).toBe(90);
	});

	it("item com shipsInOwnBox usa as próprias dims (telescópica 180cm)", () => {
		const tele: QuoteItem = {
			lengthCm: 180,
			widthCm: 34,
			heightCm: 34,
			weightKg: 5.8,
			packagingWeightKg: 1,
			stackable: false,
			shipsInOwnBox: true,
			qty: 1,
		};
		const pkgs = packItems([tele], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.lengthCm).toBe(180);
		expect(pkgs[0]?.weightKg).toBeCloseTo(6.8, 3);
		expect(pkgs[0]?.outOfCatalog).toBe(false);
	});

	it("item que não cabe em nenhuma caixa → pacote fora de catálogo", () => {
		const enorme: QuoteItem = {
			lengthCm: 200,
			widthCm: 80,
			heightCm: 80,
			weightKg: 50,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const pkgs = packItems([enorme], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.outOfCatalog).toBe(true);
	});
});

const CARRIER_BASE: Omit<QuoteCarrier, "zones"> = {
	id: "c1",
	name: "Transp X",
	cubageDivisor: 6000,
	grisPercent: null,
	grisMinAmount: null,
	advaloremPercent: null,
	tollAmount: null,
	icmsPercent: null,
};

const ZONA_CWB: QuoteCarrier["zones"][number] = {
	cepRanges: [{ from: "80000000", to: "82999999" }],
	deliveryDays: 3,
	minFreightAmount: 20,
	rates: [
		{ weightFromKg: 0, weightToKg: 30, baseAmount: 25, perKgAmount: 0 },
		{ weightFromKg: 30, weightToKg: null, baseAmount: 25, perKgAmount: 1.5 },
	],
};

describe("matchCepRange", () => {
	it("casa CEP dentro da faixa (normaliza máscara)", () => {
		expect(
			matchCepRange("81.200-526", [{ from: "80000000", to: "82999999" }])
		).toBe(true);
		expect(
			matchCepRange("01000000", [{ from: "80000000", to: "82999999" }])
		).toBe(false);
	});
});

describe("quoteShipping", () => {
	const boxes: QuoteBox[] = BOXES;
	const itens = [{ ...FURADEIRA, qty: 1 }]; // 17.5kg em box-s 35x35x30

	it("cota faixa discreta + frete mínimo", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options).toHaveLength(1);
		// peso cobrado = max(17.5, cubado 35*35*30/6000=6.13) = 17.5 → faixa 0-30 base 25
		expect(r.options[0]?.amount).toBeCloseTo(25, 2);
		expect(r.options[0]?.deliveryDays).toBe(3);
		expect(r.unquotable).toHaveLength(0);
	});

	it("aplica kg excedente acima da faixa topo", () => {
		// 4 furadeiras = 69.8kg, faixa 30-∞ base 25 + (69.8-30)*1.5 = 25 + 59.7 = 84.7
		const r = quoteShipping({
			items: [{ ...FURADEIRA, qty: 4 }],
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options[0]?.amount).toBeCloseTo(84.7, 1);
	});

	it("soma GRIS, ad valorem e aplica ICMS por dentro", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "81200526",
			declaredValue: 1000,
			carriers: [
				{
					...CARRIER_BASE,
					grisPercent: 0.5,
					grisMinAmount: 5,
					advaloremPercent: 1,
					icmsPercent: 12,
					zones: [ZONA_CWB],
				},
			],
			boxes,
		});
		// frete 25 + gris max(5,5)=5 + advalorem 10 = 40 ; ICMS 12% por dentro: 40/0.88 = 45.45
		expect(r.options[0]?.amount).toBeCloseTo(45.45, 2);
	});

	it("CEP sem zona → unquotable no_zone", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "01000000",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options).toHaveLength(0);
		expect(r.unquotable[0]?.reason).toBe("no_zone");
	});

	it("pacote fora de catálogo → unquotable out_of_catalog", () => {
		const enorme: QuoteItem = {
			lengthCm: 200,
			widthCm: 80,
			heightCm: 80,
			weightKg: 50,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const r = quoteShipping({
			items: [enorme],
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.unquotable[0]?.reason).toBe("out_of_catalog");
	});
});
