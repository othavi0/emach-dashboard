import { describe, expect, it } from "vitest";
import { cnpjMask } from "../cnpj";

describe("cnpjMask", () => {
	it("formata CNPJ numérico", () => {
		expect(cnpjMask.format("11222333000181")).toBe("11.222.333/0001-81");
	});

	it("formata CNPJ alfanumérico em maiúsculas", () => {
		expect(cnpjMask.format("12abc34501de35")).toBe("12.ABC.345/01DE-35");
	});

	it("trata entrada parcial com letra", () => {
		expect(cnpjMask.sanitize("12abc")).toBe("12.ABC");
	});

	it("corta além de 14 caracteres", () => {
		expect(cnpjMask.sanitize("12ABC34501DE35999")).toBe("12.ABC.345/01DE-35");
	});

	it("devolve letras e dígitos sem pontuação", () => {
		expect(cnpjMask.parse("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
		expect(cnpjMask.parse("12.abc.345/01de-35")).toBe("12ABC34501DE35");
		expect(cnpjMask.parse("11.222.333/0001-81")).toBe("11222333000181");
	});

	it("devolve undefined para campo vazio", () => {
		expect(cnpjMask.parse("")).toBeUndefined();
		expect(cnpjMask.format(undefined)).toBe("");
	});
});
