import { describe, expect, it } from "vitest";

import {
	documentZodRefine,
	formatDocument,
	isValidCnpj,
	isValidCpf,
	isValidDocument,
	normalizeDocument,
} from "../cpf-cnpj";

// CPF real válido para testes (Receita Federal — gerado por algoritmo,
// não pertence a pessoa física real).
// DV calculado: soma 1-9 ponderada por (10-i); (sum*10)%11; idem DV2.
const VALID_CPF_DIGITS = "529.982.247-25"; // dígitos: 52998224725
const VALID_CPF_NORMALIZED = "52998224725";

// CNPJ real válido para testes (empresa fictícia, não cadastrada).
const VALID_CNPJ_DIGITS = "11.222.333/0001-81"; // dígitos: 11222333000181
const VALID_CNPJ_NORMALIZED = "11222333000181";

describe("normalizeDocument", () => {
	it("remove pontuação de CPF formatado", () => {
		expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
	});

	it("remove pontuação de CNPJ formatado", () => {
		expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
	});

	it("retorna string vazia para null", () => {
		expect(normalizeDocument(null)).toBe("");
	});

	it("retorna string vazia para undefined", () => {
		expect(normalizeDocument(undefined)).toBe("");
	});

	it("retorna string vazia para string vazia", () => {
		expect(normalizeDocument("")).toBe("");
	});
});

describe("formatDocument", () => {
	it("formata 11 dígitos como CPF (XXX.XXX.XXX-XX)", () => {
		expect(formatDocument(VALID_CPF_NORMALIZED)).toBe("529.982.247-25");
	});

	it("formata 14 dígitos como CNPJ (XX.XXX.XXX/XXXX-XX)", () => {
		expect(formatDocument(VALID_CNPJ_NORMALIZED)).toBe("11.222.333/0001-81");
	});

	it("retorna dígitos crus para comprimento inválido (ex: 10)", () => {
		expect(formatDocument("1234567890")).toBe("1234567890");
	});

	it("normaliza antes de formatar (aceita entrada com pontuação)", () => {
		expect(formatDocument(VALID_CPF_DIGITS)).toBe("529.982.247-25");
	});
});

describe("isValidCpf", () => {
	it("aceita CPF válido (dígitos puros)", () => {
		expect(isValidCpf(VALID_CPF_NORMALIZED)).toBe(true);
	});

	it("aceita CPF válido com pontuação (normaliza internamente)", () => {
		expect(isValidCpf(VALID_CPF_DIGITS)).toBe(true);
	});

	it("rejeita todos-dígitos-iguais: 000.000.000-00", () => {
		expect(isValidCpf("00000000000")).toBe(false);
	});

	it("rejeita todos-dígitos-iguais: 111.111.111-11", () => {
		expect(isValidCpf("11111111111")).toBe(false);
	});

	it("rejeita todos-dígitos-iguais: 999.999.999-99", () => {
		expect(isValidCpf("99999999999")).toBe(false);
	});

	it("rejeita quando DV1 está errado (último dígito - 1, módulo ajustado)", () => {
		// Altera o 10º dígito (DV1) do CPF válido
		const corrupted =
			VALID_CPF_NORMALIZED.slice(0, 9) +
			String((Number(VALID_CPF_NORMALIZED[9]) + 1) % 10) +
			VALID_CPF_NORMALIZED[10];
		expect(isValidCpf(corrupted)).toBe(false);
	});

	it("rejeita quando DV2 está errado (último dígito)", () => {
		// Altera só o 11º dígito (DV2)
		const corrupted =
			VALID_CPF_NORMALIZED.slice(0, 10) +
			String((Number(VALID_CPF_NORMALIZED[10]) + 1) % 10);
		expect(isValidCpf(corrupted)).toBe(false);
	});

	it("rejeita comprimento diferente de 11 dígitos", () => {
		expect(isValidCpf("1234567890")).toBe(false); // 10 dígitos
		expect(isValidCpf("123456789012")).toBe(false); // 12 dígitos
	});

	it("rejeita null", () => {
		expect(isValidCpf(null)).toBe(false);
	});

	it("rejeita undefined", () => {
		expect(isValidCpf(undefined)).toBe(false);
	});
});

describe("isValidCpf — caso DV >= 10 -> 0", () => {
	// CPF cujo cálculo de DV produz resto 10 (mapeado para 0).
	// "10000000108": base "100000001", soma ponderada = 12, (12*10)%11 = 10 → DV1 = 0.
	// Verificado externamente pelo mesmo algoritmo de cpf-cnpj.ts.
	it("aceita CPF cujo DV calculado é 0 (caso (sum*10)%11 == 10 → dv = 0)", () => {
		expect(isValidCpf("10000000108")).toBe(true);
	});
});

describe("isValidCnpj", () => {
	it("aceita CNPJ válido (dígitos puros)", () => {
		expect(isValidCnpj(VALID_CNPJ_NORMALIZED)).toBe(true);
	});

	it("aceita CNPJ válido com pontuação (normaliza internamente)", () => {
		expect(isValidCnpj(VALID_CNPJ_DIGITS)).toBe(true);
	});

	it("rejeita todos-dígitos-iguais: 00.000.000/0000-00", () => {
		expect(isValidCnpj("00000000000000")).toBe(false);
	});

	it("rejeita todos-dígitos-iguais: 11.111.111/1111-11", () => {
		expect(isValidCnpj("11111111111111")).toBe(false);
	});

	it("rejeita quando DV1 está errado", () => {
		// Altera o 13º dígito (DV1)
		const corrupted =
			VALID_CNPJ_NORMALIZED.slice(0, 12) +
			String((Number(VALID_CNPJ_NORMALIZED[12]) + 1) % 10) +
			VALID_CNPJ_NORMALIZED[13];
		expect(isValidCnpj(corrupted)).toBe(false);
	});

	it("rejeita quando DV2 está errado", () => {
		// Altera o 14º dígito (DV2)
		const corrupted =
			VALID_CNPJ_NORMALIZED.slice(0, 13) +
			String((Number(VALID_CNPJ_NORMALIZED[13]) + 1) % 10);
		expect(isValidCnpj(corrupted)).toBe(false);
	});

	it("rejeita comprimento diferente de 14 dígitos", () => {
		expect(isValidCnpj("1234567890123")).toBe(false); // 13 dígitos
		expect(isValidCnpj("123456789012345")).toBe(false); // 15 dígitos
	});

	it("rejeita null", () => {
		expect(isValidCnpj(null)).toBe(false);
	});

	it("rejeita undefined", () => {
		expect(isValidCnpj(undefined)).toBe(false);
	});
});

describe("isValidDocument", () => {
	it("despacha para isValidCpf quando 11 dígitos (válido)", () => {
		expect(isValidDocument(VALID_CPF_NORMALIZED)).toBe(true);
	});

	it("despacha para isValidCnpj quando 14 dígitos (válido)", () => {
		expect(isValidDocument(VALID_CNPJ_NORMALIZED)).toBe(true);
	});

	it("retorna false para CPF inválido (11 dígitos, DV errado)", () => {
		expect(isValidDocument("00000000000")).toBe(false);
	});

	it("retorna false para CNPJ inválido (14 dígitos, todos iguais)", () => {
		expect(isValidDocument("00000000000000")).toBe(false);
	});

	it("retorna false para comprimento que não é 11 nem 14", () => {
		expect(isValidDocument("123456789012")).toBe(false); // 12 dígitos
		expect(isValidDocument("")).toBe(false);
	});

	it("aceita entrada com pontuação (normaliza internamente)", () => {
		expect(isValidDocument(VALID_CPF_DIGITS)).toBe(true);
		expect(isValidDocument(VALID_CNPJ_DIGITS)).toBe(true);
	});
});

describe("documentZodRefine", () => {
	it("retorna true para string vazia (campo opcional)", () => {
		expect(documentZodRefine("")).toBe(true);
	});

	it("retorna true para CPF válido", () => {
		expect(documentZodRefine(VALID_CPF_NORMALIZED)).toBe(true);
	});

	it("retorna true para CNPJ válido", () => {
		expect(documentZodRefine(VALID_CNPJ_NORMALIZED)).toBe(true);
	});

	it("retorna false para CPF inválido", () => {
		expect(documentZodRefine("00000000000")).toBe(false);
	});

	it("retorna false para CNPJ inválido", () => {
		expect(documentZodRefine("00000000000000")).toBe(false);
	});

	it("retorna false para comprimento arbitrário (não é CPF nem CNPJ)", () => {
		expect(documentZodRefine("123")).toBe(false);
	});
});
