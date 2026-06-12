import { describe, expect, it } from "vitest";
import { groupAttributesByCategory } from "../attribute-grouping";
import type { ToolDetailAttribute } from "../tool-detail-data";

function attr(p: Partial<ToolDetailAttribute>): ToolDetailAttribute {
	return {
		slug: "x",
		label: "X",
		inputType: "number",
		unit: null,
		options: null,
		sortOrder: 0,
		sourceCategoryId: "c",
		sourceCategoryName: "C",
		sourceCategoryDepth: 0,
		valueText: null,
		valueNumeric: 1,
		valueNumericMax: null,
		valueBool: null,
		...p,
	};
}

describe("groupAttributesByCategory", () => {
	it("agrupa por categoria-fonte, ordena grupos por depth e itens por sortOrder", () => {
		const result = groupAttributesByCategory([
			attr({
				slug: "mandril",
				sourceCategoryId: "fur",
				sourceCategoryName: "Furadeiras",
				sourceCategoryDepth: 2,
				sortOrder: 0,
			}),
			attr({
				slug: "torque",
				sourceCategoryId: "ele",
				sourceCategoryName: "Elétricas",
				sourceCategoryDepth: 1,
				sortOrder: 3,
			}),
			attr({
				slug: "potencia",
				sourceCategoryId: "ele",
				sourceCategoryName: "Elétricas",
				sourceCategoryDepth: 1,
				sortOrder: 0,
			}),
		]);
		expect(result.map((g) => g.categoryName)).toEqual([
			"Elétricas",
			"Furadeiras",
		]);
		// biome-ignore lint/style/noNonNullAssertion: tamanho garantido pela assertion acima
		expect(result[0]!.attributes.map((a) => a.slug)).toEqual([
			"potencia",
			"torque",
		]);
	});

	it("devolve [] para entrada vazia", () => {
		expect(groupAttributesByCategory([])).toEqual([]);
	});
});
