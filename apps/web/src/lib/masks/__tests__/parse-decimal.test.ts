import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "../parse-decimal";

describe("parseLocaleNumber", () => {
	it("aceita vírgula e ponto como separador decimal", () => {
		expect(parseLocaleNumber("12,50", 2)).toBe(12.5);
		expect(parseLocaleNumber("12.50", 2)).toBe(12.5);
		expect(parseLocaleNumber("0,5", 2)).toBe(0.5);
		expect(parseLocaleNumber(",5", 2)).toBe(0.5);
	});

	it("descarta separador de milhar: o último separador é o decimal", () => {
		expect(parseLocaleNumber("1.234,56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("1,234.56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("1.2.3,4", 2)).toBe(123.4);
	});

	it("dois ou mais separadores do mesmo caractere são todos milhar, sem decimal", () => {
		expect(parseLocaleNumber("1.000.000", 2)).toBe(1_000_000);
		expect(parseLocaleNumber("1.000.000", 3)).toBe(1_000_000);
		expect(parseLocaleNumber("1,234,567", 2)).toBe(1_234_567);
		expect(parseLocaleNumber("1,234,567", 3)).toBe(1_234_567);
		// separadores de tipos diferentes continuam decimal no último (regra anterior, sem regressão)
		expect(parseLocaleNumber("1.234.567,89", 2)).toBe(1_234_567.89);
	});

	it("sem separador, lê o número inteiro", () => {
		expect(parseLocaleNumber("1500", 2)).toBe(1500);
		expect(parseLocaleNumber("0", 2)).toBe(0);
	});

	it("desempata separador único com 3 dígitos pela precisão do campo", () => {
		// dinheiro (2 casas): 3 dígitos não são centavos → milhar
		expect(parseLocaleNumber("1.500", 2)).toBe(1500);
		expect(parseLocaleNumber("1,500", 2)).toBe(1500);
		// peso (3 casas): 3 dígitos são válidos → decimal
		expect(parseLocaleNumber("1.500", 3)).toBe(1.5);
		expect(parseLocaleNumber("1,500", 3)).toBe(1.5);
	});

	it("arredonda casas em excesso à precisão do campo", () => {
		expect(parseLocaleNumber("1,2345", 2)).toBe(1.23);
		expect(parseLocaleNumber("1,2345", 3)).toBe(1.234);
	});

	it("devolve undefined para entrada sem número", () => {
		expect(parseLocaleNumber("", 2)).toBeUndefined();
		expect(parseLocaleNumber("abc", 2)).toBeUndefined();
		expect(parseLocaleNumber(",", 2)).toBeUndefined();
		expect(parseLocaleNumber(".", 2)).toBeUndefined();
	});

	it("ignora símbolos e espaços ao redor do número", () => {
		expect(parseLocaleNumber("R$ 1.234,56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("10%", 2)).toBe(10);
		expect(parseLocaleNumber(" 12,5 ", 2)).toBe(12.5);
	});
});
