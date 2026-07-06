import { describe, expect, it } from "vitest";
import {
	firstStepWithError,
	getStepFieldErrors,
	STEP_FIELDS,
	TOOL_STEPS,
} from "@/app/dashboard/tools/_components/tool-form-steps";

const EMPTY = {
	name: "",
	description: "",
	model: "",
	invoiceModel: "",
	manufacturerName: "",
	status: "draft" as const,
	hsCode: "",
	ncm: "",
	cest: "",
	powerWatts: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	categoryIds: [] as string[],
	primaryCategoryId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
	variants: [
		{
			sku: "",
			barcode: "",
			voltage: "",
			priceAmount: 0,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
	attributeAssignments: [],
};

const VALID_IDENTITY = {
	...EMPTY,
	name: "Furadeira",
	categoryIds: ["c1"],
	primaryCategoryId: "c1",
};

describe("TOOL_STEPS", () => {
	it("tem 6 passos na ordem esperada com fiscal opcional", () => {
		expect(TOOL_STEPS.map((s) => s.id)).toEqual([
			"identity",
			"variants",
			"specs",
			"logistics",
			"fiscal",
			"publish",
		]);
		expect(TOOL_STEPS.find((s) => s.id === "fiscal")?.optional).toBe(true);
	});

	it("STEP_FIELDS cobre exatamente os 6 passos", () => {
		expect(Object.keys(STEP_FIELDS).sort()).toEqual(
			["fiscal", "identity", "logistics", "publish", "specs", "variants"].sort()
		);
	});
});

describe("getStepFieldErrors", () => {
	it("acusa nome e categoria faltando no passo identity", () => {
		const errors = getStepFieldErrors(EMPTY, "identity", false);
		expect(errors.name).toBeTruthy();
		expect(errors.categoryIds ?? errors.primaryCategoryId).toBeTruthy();
	});

	it("não vaza erro de peso (logistics) pro passo identity", () => {
		const errors = getStepFieldErrors(EMPTY, "identity", false);
		expect(errors.weightKg).toBeUndefined();
	});

	it("acusa peso faltando no passo logistics", () => {
		const errors = getStepFieldErrors(EMPTY, "logistics", false);
		expect(errors.weightKg).toBeTruthy();
	});

	it("passo identity fica sem erros quando nome+categoria estão preenchidos", () => {
		expect(getStepFieldErrors(VALID_IDENTITY, "identity", false)).toEqual({});
	});
});

describe("firstStepWithError", () => {
	it("retorna 'identity' quando o nome está vazio", () => {
		expect(firstStepWithError(EMPTY, false)).toBe("identity");
	});

	it("retorna null quando tudo válido para draft", () => {
		const values = {
			...EMPTY,
			name: "Furadeira",
			weightKg: 1,
			lengthCm: 1,
			widthCm: 1,
			heightCm: 1,
			categoryIds: ["c1"],
			primaryCategoryId: "c1",
			variants: [
				{
					sku: "SKU-1",
					barcode: "BAR-1",
					priceAmount: 10,
					isDefault: true,
					sortOrder: 0,
				},
			],
		};
		expect(firstStepWithError(values, false)).toBeNull();
	});
});
