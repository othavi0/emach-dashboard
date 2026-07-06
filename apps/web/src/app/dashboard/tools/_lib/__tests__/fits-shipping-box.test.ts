import { describe, expect, it } from "vitest";
import { type FitCheckItem, fitsAnyActiveBox } from "../fits-shipping-box";

const BOXES = [
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

const FURADEIRA: FitCheckItem = {
	lengthCm: 35,
	widthCm: 30,
	heightCm: 28,
	weightKg: 15,
	packagingWeightKg: 2,
	stackable: true,
};

describe("fitsAnyActiveBox", () => {
	it("item pequeno cabe (na menor caixa)", () => {
		expect(fitsAnyActiveBox(FURADEIRA, BOXES)).toBe(true);
	});

	it("cabe só com rotação (maior eixo deitado)", () => {
		// 58×20×20 não cabe na box-s em nenhuma orientação (58 > 35),
		// mas cabe na box-l (70×60×50) com o eixo de 58 no comprimento.
		const comprido: FitCheckItem = {
			lengthCm: 20,
			widthCm: 58,
			heightCm: 20,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
		};
		expect(fitsAnyActiveBox(comprido, BOXES)).toBe(true);
	});

	it("estoura dimensão em todas as caixas → false", () => {
		const gigante: FitCheckItem = {
			lengthCm: 200,
			widthCm: 80,
			heightCm: 80,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
		};
		expect(fitsAnyActiveBox(gigante, BOXES)).toBe(false);
	});

	it("peso + embalagem + tara estoura o máximo de todas → false", () => {
		// Dims cabem até na box-s, mas 79 + 1 + tara 1.8 = 81.8 > 80 (xl);
		// nas menores estoura ainda mais cedo.
		const denso: FitCheckItem = {
			lengthCm: 30,
			widthCm: 30,
			heightCm: 25,
			weightKg: 79,
			packagingWeightKg: 1,
			stackable: true,
		};
		expect(fitsAnyActiveBox(denso, BOXES)).toBe(false);
	});

	it("peso conta a tara: 78 + 0.5 + 1.8 = 80.3 > 80 → false; sem embalagem extra caberia", () => {
		const noLimite: FitCheckItem = {
			lengthCm: 30,
			widthCm: 30,
			heightCm: 25,
			weightKg: 78,
			packagingWeightKg: 0.5,
			stackable: true,
		};
		expect(fitsAnyActiveBox(noLimite, BOXES)).toBe(false);
		expect(fitsAnyActiveBox({ ...noLimite, packagingWeightKg: 0 }, BOXES)).toBe(
			true
		);
	});

	it("não-empilhável reserva a coluna: item chapado 70×60×1 não cabe na box-l", () => {
		// footprint 70×60 × altura interna 50 = 210000 > 210000×0.9;
		// empilhável, o mesmo item cabe (volume real 4200).
		const chapado: FitCheckItem = {
			lengthCm: 70,
			widthCm: 60,
			heightCm: 1,
			weightKg: 5,
			packagingWeightKg: 0,
			stackable: false,
		};
		expect(
			fitsAnyActiveBox(chapado, [BOXES[1] as (typeof BOXES)[number]])
		).toBe(false);
		expect(
			fitsAnyActiveBox({ ...chapado, stackable: true }, [
				BOXES[1] as (typeof BOXES)[number],
			])
		).toBe(true);
	});

	it("lista de caixas vazia → false", () => {
		expect(fitsAnyActiveBox(FURADEIRA, [])).toBe(false);
	});

	it("fillFactor customizado aperta a régua (paridade com o motor)", () => {
		const naoEmpilhavel: FitCheckItem = { ...FURADEIRA, stackable: false };
		// occupied 35×30×30=31500; 0.9×36750 ok na box-s, 0.5×36750 não —
		// mas ainda cabe na box-l, então restringe para só a box-s:
		const boxS = BOXES[0] as (typeof BOXES)[number];
		expect(fitsAnyActiveBox(naoEmpilhavel, [boxS])).toBe(true);
		expect(fitsAnyActiveBox(naoEmpilhavel, [boxS], 0.5)).toBe(false);
	});

	it("uprightOnly não deita: 20×20×58 falha na box-l, passa sem a trava", () => {
		const emPe: FitCheckItem = {
			lengthCm: 20,
			widthCm: 20,
			heightCm: 58,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
			uprightOnly: true,
		};
		const boxL = BOXES[1] as (typeof BOXES)[number];
		expect(fitsAnyActiveBox(emPe, [boxL])).toBe(false);
		expect(fitsAnyActiveBox({ ...emPe, uprightOnly: false }, [boxL])).toBe(
			true
		);
	});
});
