import { describe, expect, it } from "vitest";
import type { AttributeValueInput } from "../tool-schema";
import { countFilledSpecs, MIN_SPECS_ACTIVE } from "../tool-schema";

const txt = (s: string): AttributeValueInput => ({ valueText: s });
const num = (n: number): AttributeValueInput => ({ valueNumeric: n });
const bool = (b: boolean): AttributeValueInput => ({ valueBool: b });

describe("MIN_SPECS_ACTIVE", () => {
	it("é 4", () => {
		expect(MIN_SPECS_ACTIVE).toBe(4);
	});
});

describe("countFilledSpecs", () => {
	it("conta apenas atributos vinculados E com valor real", () => {
		const values: Record<string, AttributeValueInput> = {
			a: txt("700W"),
			b: num(12),
			c: bool(false),
			d: txt(""), // vazio → não conta
		};
		const assignments = ["a", "b", "c", "d"];
		expect(countFilledSpecs(values, assignments)).toBe(3);
	});

	it("ignora valores sem vínculo (preenchido mas não em assignments)", () => {
		const values: Record<string, AttributeValueInput> = {
			a: txt("x"),
			orphan: txt("y"),
		};
		expect(countFilledSpecs(values, ["a"])).toBe(1);
	});

	it("ignora vinculados sem valor algum", () => {
		const values: Record<string, AttributeValueInput> = { a: txt("x") };
		expect(countFilledSpecs(values, ["a", "b", "c"])).toBe(1);
	});

	it("trata texto só de espaços como vazio", () => {
		expect(countFilledSpecs({ a: txt("   ") }, ["a"])).toBe(0);
	});

	it("NaN em valueNumeric não conta", () => {
		expect(countFilledSpecs({ a: { valueNumeric: Number.NaN } }, ["a"])).toBe(
			0
		);
	});

	it("valueBool false conta como preenchido", () => {
		expect(countFilledSpecs({ a: bool(false) }, ["a"])).toBe(1);
	});
});
