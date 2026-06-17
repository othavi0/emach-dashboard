import { describe, expect, it } from "vitest";

import { formatMeasure } from "../number";

describe("formatMeasure", () => {
	it("retorna null para vazio/null/undefined", () => {
		expect(formatMeasure(null)).toBeNull();
		expect(formatMeasure(undefined)).toBeNull();
		expect(formatMeasure("")).toBeNull();
	});

	it("retorna null para string não-numérica (NaN)", () => {
		expect(formatMeasure("abc")).toBeNull();
		expect(formatMeasure("--")).toBeNull();
	});

	it("formata a string crua do Postgres sem ler o ponto como milhar", () => {
		// O bug original: "5.000" (5 kg) renderizado cru vira "cinco mil" em pt-BR.
		expect(formatMeasure("5.000")).toBe("5");
		expect(formatMeasure("5.200")).toBe("5,2");
		expect(formatMeasure("0.500")).toBe("0,5");
	});

	it("usa vírgula decimal e ponto de milhar (pt-BR)", () => {
		expect(formatMeasure(1234.5)).toBe("1.234,5");
		expect(formatMeasure(12_000)).toBe("12.000");
	});

	it("respeita maxFractionDigits (dimensões usam 2)", () => {
		expect(formatMeasure("28.00", 2)).toBe("28");
		expect(formatMeasure("30.50", 2)).toBe("30,5");
	});

	it("lida com zero e negativos", () => {
		expect(formatMeasure(0)).toBe("0");
		expect(formatMeasure("0.000")).toBe("0");
		expect(formatMeasure(-1.5)).toBe("-1,5");
	});
});
