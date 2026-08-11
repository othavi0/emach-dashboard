import { describe, expect, it } from "vitest";
import { decimalMask } from "../decimal";
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
