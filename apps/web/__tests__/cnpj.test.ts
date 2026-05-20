import { describe, expect, it } from "vitest";

import { isValidCnpj, normalizeCnpj } from "@/lib/validation/cnpj";

describe("normalizeCnpj", () => {
	it("remove caracteres não numéricos", () => {
		expect(normalizeCnpj("11.444.777/0001-61")).toBe("11444777000161");
		expect(normalizeCnpj("  11444777000161  ")).toBe("11444777000161");
	});

	it("retorna string vazia para input vazio", () => {
		expect(normalizeCnpj("")).toBe("");
		expect(normalizeCnpj("   ")).toBe("");
	});
});

describe("isValidCnpj", () => {
	it("aceita CNPJs com dígitos verificadores corretos", () => {
		expect(isValidCnpj("11.444.777/0001-61")).toBe(true);
		expect(isValidCnpj("11444777000161")).toBe(true);
	});

	it("rejeita comprimento errado", () => {
		expect(isValidCnpj("11444777000")).toBe(false);
		expect(isValidCnpj("114447770001610")).toBe(false);
	});

	it("rejeita todos os dígitos iguais (caso patológico)", () => {
		expect(isValidCnpj("00000000000000")).toBe(false);
		expect(isValidCnpj("11111111111111")).toBe(false);
	});

	it("rejeita dígito verificador incorreto", () => {
		expect(isValidCnpj("11444777000162")).toBe(false);
		expect(isValidCnpj("11444777000171")).toBe(false);
	});
});
