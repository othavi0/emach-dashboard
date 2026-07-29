import { describe, expect, it } from "vitest";

import {
	conversionHint,
	displayToKg,
	initialUnit,
	kgToDisplay,
} from "../weight-unit";

describe("kgToDisplay", () => {
	it("kg passa direto; g multiplica por 1000 e arredonda", () => {
		expect(kgToDisplay(2.5, "kg")).toBe(2.5);
		expect(kgToDisplay(0.35, "g")).toBe(350);
		expect(kgToDisplay(0.0004, "g")).toBe(0);
	});

	it("undefined atravessa", () => {
		expect(kgToDisplay(undefined, "kg")).toBeUndefined();
		expect(kgToDisplay(undefined, "g")).toBeUndefined();
	});
});

describe("displayToKg", () => {
	it("g inteiro vira kg com 3 casas", () => {
		expect(displayToKg(350, "g")).toBe(0.35);
		expect(displayToKg(1500, "g")).toBe(1.5);
	});

	it("g fracionário arredonda pra grama inteira (resolução do banco)", () => {
		expect(displayToKg(350.7, "g")).toBe(0.351);
	});

	it("kg arredonda a 3 casas", () => {
		expect(displayToKg(2.5, "kg")).toBe(2.5);
		expect(displayToKg(2.5006, "kg")).toBe(2.501);
	});

	it("ida-e-volta g→kg→g não deriva", () => {
		for (const g of [1, 80, 350, 999, 1234]) {
			expect(kgToDisplay(displayToKg(g, "g"), "g")).toBe(g);
		}
	});

	it("undefined atravessa", () => {
		expect(displayToKg(undefined, "g")).toBeUndefined();
	});
});

describe("initialUnit", () => {
	it("valor sub-kg abre em gramas", () => {
		expect(initialUnit(0.35, "kg")).toBe("g");
		expect(initialUnit(0.999, "kg")).toBe("g");
	});

	it("≥ 1 kg, zero ou vazio usam o fallback do campo", () => {
		expect(initialUnit(1, "g")).toBe("g");
		expect(initialUnit(2.5, "kg")).toBe("kg");
		expect(initialUnit(0, "g")).toBe("g");
		expect(initialUnit(undefined, "kg")).toBe("kg");
	});
});

describe("conversionHint", () => {
	it("modo g mostra o equivalente em kg", () => {
		expect(conversionHint(0.35, "g")).toBe("= 0,35 kg");
	});

	it("modo kg sub-kg mostra o equivalente em g", () => {
		expect(conversionHint(0.35, "kg")).toBe("= 350 g");
	});

	it("modo kg ≥ 1 kg não mostra hint", () => {
		expect(conversionHint(2.5, "kg")).toBeNull();
	});

	it("vazio ou zero não mostra hint", () => {
		expect(conversionHint(undefined, "g")).toBeNull();
		expect(conversionHint(0, "g")).toBeNull();
	});
});
