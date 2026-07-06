import { describe, expect, it } from "vitest";
import { packItems, type QuoteBox, type QuoteItem } from "../shipping-quote";

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

	it("multi-caixa: item comprido usa a caixa 'tubo' mesmo não sendo a maior", () => {
		// Bug antigo: o multi-caixa só testava a caixa de MAIOR volume (cubo) e
		// marcava a vara como fora de catálogo, ignorando o tubo.
		const tubo: QuoteBox = {
			id: "tubo",
			internalLengthCm: 180,
			internalWidthCm: 15,
			internalHeightCm: 15,
			maxWeightKg: 10,
			tareWeightKg: 0.5,
		};
		const cubo: QuoteBox = {
			id: "cubo",
			internalLengthCm: 60,
			internalWidthCm: 60,
			internalHeightCm: 60,
			maxWeightKg: 30,
			tareWeightKg: 1,
		};
		const vara: QuoteItem = {
			lengthCm: 170,
			widthCm: 10,
			heightCm: 10,
			weightKg: 3,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const cubao: QuoteItem = {
			lengthCm: 50,
			widthCm: 50,
			heightCm: 50,
			weightKg: 20,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const pkgs = packItems([vara, cubao], [tubo, cubo]);
		expect(pkgs).toHaveLength(2);
		expect(pkgs.every((p) => !p.outOfCatalog)).toBe(true);
		expect(pkgs.some((p) => p.lengthCm === 180)).toBe(true);
	});

	it("multi-caixa: bin residual pequeno sai na MENOR caixa, não na maior", () => {
		// Bug antigo: todo bin era emitido com as dims da maior caixa,
		// inflando o peso cubado do frete.
		const pesado: QuoteItem = {
			lengthCm: 60,
			widthCm: 50,
			heightCm: 40,
			weightKg: 70,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		// pesado + furadeira não fecham em caixa única (88.8kg > 80 da box-xl).
		const pkgs = packItems([pesado, { ...FURADEIRA, qty: 1 }], BOXES);
		expect(pkgs).toHaveLength(2);
		const residual = pkgs.find((p) => p.lengthCm === 35);
		expect(residual).toBeDefined();
		expect(residual?.weightKg).toBeCloseTo(17.5, 3); // 15 + 2 + tara box-s 0.5
	});

	it("fillFactor menor força caixa maior (0.5 vs default 0.9)", () => {
		// Furadeira não-empilhável ocupa 31500 na box-s (0.9×36750=33075 ok;
		// 0.5×36750=18375 não) → com 0.5 sobe pra box-l.
		const strict = packItems([{ ...FURADEIRA, qty: 1 }], BOXES, {
			fillFactor: 0.5,
		});
		expect(strict[0]?.lengthCm).toBe(70);
		const relaxed = packItems([{ ...FURADEIRA, qty: 1 }], BOXES);
		expect(relaxed[0]?.lengthCm).toBe(35);
	});

	it("boxPaddingCm soma nas dims do pacote de catálogo, não no 'a combinar'", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 1 }], BOXES, {
			boxPaddingCm: 2,
		});
		expect(pkgs[0]?.lengthCm).toBe(37);
		expect(pkgs[0]?.widthCm).toBe(37);
		expect(pkgs[0]?.heightCm).toBe(32);
	});

	it("catálogo vazio (boxes=[]) → pacote fora de catálogo com dims/peso do item", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 1 }], []);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.outOfCatalog).toBe(true);
		expect(pkgs[0]?.lengthCm).toBe(35);
		expect(pkgs[0]?.weightKg).toBeCloseTo(17, 3); // 15 + 2, sem tara
	});

	it("uprightOnly: altura fixa não deita — exige caixa mais alta", () => {
		// 20×20×58 em pé: box-l (H 50) não serve; box-xl (H 60) sim.
		// Sem a trava, deitaria e caberia na box-l.
		const emPe: QuoteItem = {
			lengthCm: 20,
			widthCm: 20,
			heightCm: 58,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			uprightOnly: true,
			qty: 1,
		};
		expect(packItems([emPe], BOXES)[0]?.lengthCm).toBe(90); // box-xl
		expect(
			packItems([{ ...emPe, uprightOnly: false }], BOXES)[0]?.lengthCm
		).toBe(70); // box-l, deitado
	});
});
