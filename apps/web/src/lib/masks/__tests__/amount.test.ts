import { describe, expect, it } from "vitest";
import { amountMask } from "../amount";

describe("amountMask", () => {
	it("aceita os dois separadores", () => {
		expect(amountMask.parse("12,50")).toBe(12.5);
		expect(amountMask.parse("12.50")).toBe(12.5);
		expect(amountMask.parse("100")).toBe(100);
	});

	it("entende separador de milhar", () => {
		expect(amountMask.parse("1.234,56")).toBe(1234.56);
		expect(amountMask.parse("1,234.56")).toBe(1234.56);
		expect(amountMask.parse("1.500")).toBe(1500);
	});

	it("arredonda a centavos", () => {
		expect(amountMask.parse("1,2345")).toBe(1.23);
	});

	it("formata com milhar e duas casas", () => {
		expect(amountMask.format(1234.56)).toBe("1.234,56");
		expect(amountMask.format(100)).toBe("100,00");
		expect(amountMask.format(undefined)).toBe("");
	});

	it("faz round-trip sem drift", () => {
		expect(amountMask.parse(amountMask.format(1234.56))).toBe(1234.56);
		expect(amountMask.parse(amountMask.format(0.05))).toBe(0.05);
	});

	it("preserva a digitação em andamento", () => {
		expect(amountMask.sanitize("1.234,5")).toBe("1.234,5");
		expect(amountMask.sanitize("R$ 12,50")).toBe("12,50");
	});
});
