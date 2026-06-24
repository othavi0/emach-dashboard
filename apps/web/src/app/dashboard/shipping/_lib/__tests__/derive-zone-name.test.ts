import { describe, expect, it } from "vitest";
import { deriveZoneName } from "../derive-zone-name";

describe("deriveZoneName", () => {
	it("Brasil todo → 'Brasil'", () => {
		expect(
			deriveZoneName([{ from: "00000000", to: "99999999", label: "Brasil" }])
		).toBe("Brasil");
	});

	it("um estado → nome completo", () => {
		expect(deriveZoneName([{ from: "90000000", to: "99999999" }])).toBe(
			"Rio Grande do Sul"
		);
	});

	it("estado multi-faixa (Amazonas, 2 faixas) → 1 nome", () => {
		expect(
			deriveZoneName([
				{ from: "69000000", to: "69299999" },
				{ from: "69400000", to: "69899999" },
			])
		).toBe("Amazonas");
	});

	it("2–3 estados → siglas unidas", () => {
		expect(
			deriveZoneName([
				{ from: "90000000", to: "99999999" }, // RS
				{ from: "88000000", to: "89999999" }, // SC
				{ from: "80000000", to: "87999999" }, // PR
			])
		).toBe("RS, SC, PR");
	});

	it("≥4 estados → 'N estados'", () => {
		expect(
			deriveZoneName([
				{ from: "90000000", to: "99999999" }, // RS
				{ from: "88000000", to: "89999999" }, // SC
				{ from: "80000000", to: "87999999" }, // PR
				{ from: "01000000", to: "19999999" }, // SP
			])
		).toBe("4 estados");
	});

	it("vazio ou faixa não-preset → 'Faixa personalizada'", () => {
		expect(deriveZoneName([])).toBe("Faixa personalizada");
		expect(deriveZoneName([{ from: "12345000", to: "12345999" }])).toBe(
			"Faixa personalizada"
		);
	});
});
