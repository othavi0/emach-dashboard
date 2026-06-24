import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { describe, expect, it } from "vitest";
import {
	attributeValueRow,
	normalizeVariantValues,
} from "../../_lib/tool-query-helpers";

const def = (
	inputType: AttributeDefinition["inputType"]
): AttributeDefinition => ({
	id: "attr-1",
	slug: "attr-1",
	label: "Attr 1",
	inputType,
	unit: null,
	options: null,
	isRequired: false,
	categoryId: "cat-1",
	sortOrder: 0,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("normalizeVariantValues", () => {
	it("normaliza barcode com trim", () => {
		const out = normalizeVariantValues({
			sku: "S1",
			barcode: "  7891234567890 ",
			voltage: "",
			priceAmount: 100,
			isDefault: true,
			sortOrder: 0,
		});
		expect(out.barcode).toBe("7891234567890");
	});
});

describe("attributeValueRow", () => {
	it("text não-vazio → valueText preenchido", () => {
		expect(attributeValueRow(def("text"), { valueText: "  foo  " })).toEqual({
			valueText: "foo",
			valueNumeric: null,
			valueNumericMax: null,
			valueBool: null,
		});
	});

	it("text vazio/whitespace → null", () => {
		expect(attributeValueRow(def("text"), { valueText: "   " })).toBeNull();
	});

	it("boolean true → valueBool true", () => {
		expect(attributeValueRow(def("boolean"), { valueBool: true })).toEqual({
			valueText: null,
			valueNumeric: null,
			valueNumericMax: null,
			valueBool: true,
		});
	});

	it("number NaN → null", () => {
		expect(
			attributeValueRow(def("number"), { valueNumeric: Number.NaN })
		).toBeNull();
	});

	it("number válido → valueNumeric string", () => {
		expect(attributeValueRow(def("number"), { valueNumeric: 42 })).toEqual({
			valueText: null,
			valueNumeric: "42",
			valueNumericMax: null,
			valueBool: null,
		});
	});

	it("numeric_range com min e max → ambos setados", () => {
		expect(
			attributeValueRow(def("numeric_range"), {
				valueNumeric: 10,
				valueNumericMax: 20,
			})
		).toEqual({
			valueText: null,
			valueNumeric: "10",
			valueNumericMax: "20",
			valueBool: null,
		});
	});

	it("numeric_range com min NaN → null", () => {
		expect(
			attributeValueRow(def("numeric_range"), { valueNumeric: Number.NaN })
		).toBeNull();
	});

	it("input nulo/undefined → null", () => {
		expect(attributeValueRow(def("text"), {})).toBeNull();
	});
});
