import { describe, expect, it } from "vitest";
import { decimalMask, dimensionMask, specNumberMask } from "../decimal";
import { percentageMask } from "../percentage";

describe("decimalMask", () => {
	it("aceita os dois separadores", () => {
		expect(decimalMask.parse("2,5")).toBe(2.5);
		expect(decimalMask.parse("2.5")).toBe(2.5);
	});

	it("não colapsa separador de milhar", () => {
		expect(decimalMask.parse("1.234,56")).toBe(1234.56);
		expect(decimalMask.parse("1,234.56")).toBe(1234.56);
	});

	it("trata 3 casas como decimal (campo aceita milésimos)", () => {
		expect(decimalMask.parse("1,500")).toBe(1.5);
	});

	it("preserva o que foi digitado durante a digitação", () => {
		expect(decimalMask.sanitize("1.234,5")).toBe("1.234,5");
		expect(decimalMask.sanitize("12a,5kg")).toBe("12,5");
	});

	it("formata com vírgula e faz round-trip", () => {
		expect(decimalMask.format(2.5)).toBe("2,5");
		expect(decimalMask.format(undefined)).toBe("");
		expect(decimalMask.parse(decimalMask.format(1234.56))).toBe(1234.56);
	});
});

describe("dimensionMask", () => {
	it("trata separador único + 3 dígitos como milhar (campo não aceita milésimos)", () => {
		expect(dimensionMask.parse("1.500")).toBe(1500);
		expect(dimensionMask.parse("2,500")).toBe(2500);
		expect(dimensionMask.parse("12.500")).toBe(12_500);
	});

	it("não colapsa separadores mistos (regra 2 continua valendo)", () => {
		expect(dimensionMask.parse("1.234,56")).toBe(1234.56);
	});

	it("aceita valor sem separador", () => {
		expect(dimensionMask.parse("15")).toBe(15);
	});
});

describe("decimalMask vs dimensionMask — mesma entrada, intenção diferente", () => {
	it("'1,500' é peso (mil e quinhentos gramas) para decimalMask e dimensão inteira para dimensionMask", () => {
		expect(decimalMask.parse("1,500")).toBe(1.5);
		expect(dimensionMask.parse("1.500")).toBe(1500);
	});
});

describe("specNumberMask", () => {
	it("preserva a 4ª casa decimal", () => {
		expect(specNumberMask.parse("1,2345")).toBe(1.2345);
	});
});

describe("percentageMask", () => {
	it("aceita os dois separadores e não colapsa milhar", () => {
		expect(percentageMask.parse("10,5")).toBe(10.5);
		expect(percentageMask.parse("10.5")).toBe(10.5);
	});

	it("mantém o clamp de 0 a 100", () => {
		expect(percentageMask.parse("250")).toBe(100);
		expect(percentageMask.parse("1.234,56")).toBe(100);
	});

	it("formata com sufixo e faz round-trip", () => {
		expect(percentageMask.format(10.5)).toBe("10,5%");
		expect(percentageMask.parse(percentageMask.format(10.5))).toBe(10.5);
	});
});
