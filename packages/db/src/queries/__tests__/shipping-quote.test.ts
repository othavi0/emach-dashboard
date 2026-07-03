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
});
