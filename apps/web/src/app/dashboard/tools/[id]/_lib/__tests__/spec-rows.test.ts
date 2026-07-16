import { describe, expect, it } from "vitest";
import {
	fiscalCandidates,
	isAttributeFilled,
	type PhysicalSpecSource,
	partitionRows,
	physicalCandidates,
} from "../spec-rows";
import type { ToolDetailAttribute } from "../tool-detail-data";

function attr(over: Partial<ToolDetailAttribute>): ToolDetailAttribute {
	const base: ToolDetailAttribute = {
		slug: "x",
		label: "X",
		inputType: "text",
		unit: null,
		options: null,
		sortOrder: 0,
		sourceCategoryId: "c",
		sourceCategoryName: "Cat",
		sourceCategoryDepth: 0,
		valueText: null,
		valueNumeric: null,
		valueNumericMax: null,
		valueBool: null,
	};
	return { ...base, ...over };
}
// Nota: se ToolDetailAttribute tiver campos além destes, completar o base —
// nunca resolver com `as`/`any` (P0 banido). Mesmo princípio nos fixtures abaixo.

describe("partitionRows", () => {
	it("separa preenchidos de vazios preservando ordem e total", () => {
		const result = partitionRows([
			{ key: "a", label: "A", value: "1" },
			{ key: "b", label: "B", value: null },
			{ key: "c", label: "C", value: "3" },
		]);
		expect(result.rows.map((r) => r.key)).toEqual(["a", "c"]);
		expect(result.emptyLabels).toEqual(["B"]);
		expect(result.total).toBe(3);
	});
});

describe("physicalCandidates", () => {
	const base: PhysicalSpecSource = {
		model: "GSS280AVE",
		invoiceModel: null,
		manufacturerName: "Bosch",
		powerWatts: 300,
		weightKg: "1.4",
		lengthCm: "66.13",
		widthCm: "25.65",
		heightCm: "16.79",
	};

	it("formata potência, peso e dimensões preenchidos", () => {
		const rows = physicalCandidates(base);
		const byKey = new Map(rows.map((r) => [r.key, r]));
		expect(byKey.get("powerWatts")?.value).toBe("300 W");
		expect(byKey.get("weightKg")?.value).toBe("1,4 kg");
		expect(byKey.get("dimensions")?.value).toBe("66,13 × 25,65 × 16,79 cm");
		expect(byKey.get("model")?.mono).toBe(true);
		expect(byKey.get("invoiceModel")?.value).toBeNull();
	});

	it("dimensões incompletas contam como vazio", () => {
		const rows = physicalCandidates({ ...base, widthCm: null });
		expect(rows.find((r) => r.key === "dimensions")?.value).toBeNull();
	});
});

describe("fiscalCandidates", () => {
	it("todos os códigos fiscais são mono", () => {
		const rows = fiscalCandidates({
			hsCode: "846729",
			ncm: "84672900",
			cest: null,
		});
		expect(rows.every((r) => r.mono)).toBe(true);
		expect(rows.find((r) => r.key === "cest")?.value).toBeNull();
	});
});

describe("isAttributeFilled", () => {
	it("text: preenchido = não-vazio após trim", () => {
		expect(isAttributeFilled(attr({ valueText: "abc" }))).toBe(true);
		expect(isAttributeFilled(attr({ valueText: "  " }))).toBe(false);
		expect(isAttributeFilled(attr({ valueText: null }))).toBe(false);
	});

	it("boolean: null = vazio, false = preenchido", () => {
		expect(
			isAttributeFilled(attr({ inputType: "boolean", valueBool: false }))
		).toBe(true);
		expect(isAttributeFilled(attr({ inputType: "boolean" }))).toBe(false);
	});

	it("number e numeric_range", () => {
		expect(
			isAttributeFilled(attr({ inputType: "number", valueNumeric: 0 }))
		).toBe(true);
		expect(isAttributeFilled(attr({ inputType: "number" }))).toBe(false);
		expect(
			isAttributeFilled(
				attr({ inputType: "numeric_range", valueNumericMax: 5 })
			)
		).toBe(true);
	});
});
