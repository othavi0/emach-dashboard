import { describe, expect, it } from "vitest";
import { isBrasilTodoOnly } from "../cep-presets";

describe("isBrasilTodoOnly", () => {
	it("true quando há só a faixa Brasil inteira", () => {
		expect(isBrasilTodoOnly([{ from: "00000000", to: "99999999" }])).toBe(true);
	});
	it("false para lista vazia", () => {
		expect(isBrasilTodoOnly([])).toBe(false);
	});
	it("false quando há faixa de estado", () => {
		expect(isBrasilTodoOnly([{ from: "01000000", to: "05999999" }])).toBe(
			false
		);
	});
	it("false quando há Brasil + outra faixa", () => {
		expect(
			isBrasilTodoOnly([
				{ from: "00000000", to: "99999999" },
				{ from: "01000000", to: "05999999" },
			])
		).toBe(false);
	});
});
