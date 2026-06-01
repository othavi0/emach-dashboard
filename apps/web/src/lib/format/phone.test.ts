import { describe, expect, it } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone", () => {
	it("formata fixo de 10 dígitos", () => {
		expect(formatPhone("1636100000")).toBe("(16) 3610-0000");
	});
	it("formata celular de 11 dígitos", () => {
		expect(formatPhone("16998765432")).toBe("(16) 99876-5432");
	});
	it("normaliza entrada já mascarada", () => {
		expect(formatPhone("(16) 3610-0000")).toBe("(16) 3610-0000");
	});
	it("retorna o valor cru quando não casa 10/11 dígitos", () => {
		expect(formatPhone("123")).toBe("123");
	});
	it("retorna string vazia para null/vazio", () => {
		expect(formatPhone(null)).toBe("");
		expect(formatPhone("")).toBe("");
	});
});
