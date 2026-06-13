import { describe, expect, it } from "vitest";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";
import { firstStepWithError, getStepFieldErrors } from "../tool-form-steps";

describe("getStepFieldErrors", () => {
	it("retorna erro por campo só dos campos do passo", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "" };
		const errors = getStepFieldErrors(values, "identity");
		expect(errors.name).toBeTruthy();
	});

	it("vazio quando o passo não tem erro", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };
		const errors = getStepFieldErrors(values, "identity");
		expect(errors.name).toBeUndefined();
	});
});

describe("firstStepWithError", () => {
	it("retorna 'identity' quando o nome está vazio", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "" };
		expect(firstStepWithError(values)).toBe("identity");
	});

	it("retorna null quando tudo válido para draft", () => {
		const values = {
			...EMPTY_TOOL_VALUES,
			name: "Furadeira",
			weightKg: 1,
			lengthCm: 1,
			widthCm: 1,
			heightCm: 1,
			categoryIds: ["c1"],
			primaryCategoryId: "c1",
			variants: [
				{ sku: "SKU-1", priceAmount: 10, isDefault: true, sortOrder: 0 },
			],
		};
		expect(firstStepWithError(values)).toBeNull();
	});
});
