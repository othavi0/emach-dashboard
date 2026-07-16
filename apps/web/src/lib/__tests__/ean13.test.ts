import { describe, expect, it } from "vitest";
import { ean13Bars, ean13Modules, isValidEan13 } from "../ean13";

describe("isValidEan13", () => {
	it("aceita EAN-13 com dígito verificador correto", () => {
		// dígitos 1-12 = 789123450102; soma ponderada 1/3 → check 8
		expect(isValidEan13("7891234501028")).toBe(true);
		expect(isValidEan13("7891234501011")).toBe(true);
	});

	it("rejeita dígito verificador errado", () => {
		expect(isValidEan13("7891234501029")).toBe(false);
	});

	it("rejeita formato não-numérico ou de outro tamanho", () => {
		expect(isValidEan13("GSS280AVE-127")).toBe(false);
		expect(isValidEan13("789123450102")).toBe(false);
		expect(isValidEan13("78912345010288")).toBe(false);
		expect(isValidEan13("")).toBe(false);
	});
});

describe("ean13Modules", () => {
	it("produz 95 módulos com guards nas posições canônicas", () => {
		const m = ean13Modules("7891234501028");
		expect(m).toHaveLength(95);
		expect(m.slice(0, 3)).toBe("101"); // guard esquerda
		expect(m.slice(45, 50)).toBe("01010"); // guard central
		expect(m.slice(92)).toBe("101"); // guard direita
	});

	it("codifica o 2º dígito com paridade L do prefixo 7 (LGLGLG)", () => {
		// 1º dígito 7 → paridade LGLGLG; 2º dígito 8 em L-code = 0110111
		const m = ean13Modules("7891234501028");
		expect(m.slice(3, 10)).toBe("0110111");
	});

	it("lança para código inválido", () => {
		expect(() => ean13Modules("GSS280AVE-127")).toThrow();
	});
});

describe("ean13Bars", () => {
	it("gera runs contíguos que reconstroem os módulos", () => {
		const code = "7891234501028";
		const modules = ean13Modules(code);
		const bars = ean13Bars(code);
		const rebuilt = Array.from({ length: 95 }, () => "0");
		for (const bar of bars) {
			for (let i = bar.x; i < bar.x + bar.w; i++) {
				rebuilt[i] = "1";
			}
		}
		expect(rebuilt.join("")).toBe(modules);
		// runs não se tocam (senão seriam um run só)
		const sorted = [...bars].sort((a, b) => a.x - b.x);
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			if (prev) {
				expect(sorted[i]?.x).toBeGreaterThan(prev.x + prev.w);
			}
		}
	});
});
