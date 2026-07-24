import { describe, expect, it } from "vitest";

import { normalizeScanCode } from "../scan-input";

describe("normalizeScanCode (paste/Enter do bip)", () => {
	it("trima espaços e quebras de linha de clipboard", () => {
		expect(normalizeScanCode("  7891234567890\n")).toBe("7891234567890");
	});

	it("string só de whitespace vira vazio", () => {
		expect(normalizeScanCode("   \t  ")).toBe("");
	});
});
