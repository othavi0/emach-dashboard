import { describe, expect, it } from "vitest";

import { normalizeScanCode, scanInputOutcomeFromKind } from "../scan-input";

describe("normalizeScanCode (paste/Enter do bip)", () => {
	it("trima espaços e quebras de linha de clipboard", () => {
		expect(normalizeScanCode("  7891234567890\n")).toBe("7891234567890");
	});

	it("string só de whitespace vira vazio", () => {
		expect(normalizeScanCode("   \t  ")).toBe("");
	});
});

describe("scanInputOutcomeFromKind (limpa só no sucesso)", () => {
	it("accepted e already_complete → clear", () => {
		expect(scanInputOutcomeFromKind("accepted")).toBe("clear");
		expect(scanInputOutcomeFromKind("already_complete")).toBe("clear");
	});

	it("not_in_order → keep", () => {
		expect(scanInputOutcomeFromKind("not_in_order")).toBe("keep");
	});
});
