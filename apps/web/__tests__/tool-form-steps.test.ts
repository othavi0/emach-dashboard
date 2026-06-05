import { describe, expect, it } from "vitest";
import {
	getStepIssues,
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
	overweightShippingAmount: undefined,
	categoryIds: [] as string[],
	primaryCategoryId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
	variants: [
		{
			sku: "",
			voltage: "",
			priceAmount: 0,
			costAmount: undefined,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
	attributeAssignments: [],
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
});

describe("getStepIssues", () => {
	it("acusa nome e categoria faltando no passo identity", () => {
		const issues = getStepIssues(EMPTY, "identity");
		const paths = issues.map((i) => i.path);
		expect(paths.some((p) => p.includes("Nome"))).toBe(true);
		expect(paths.some((p) => p.includes("Categoria"))).toBe(true);
	});

	it("não vaza erro de peso (logistics) pro passo identity", () => {
		const issues = getStepIssues(EMPTY, "identity");
		expect(issues.some((i) => i.path.includes("Peso"))).toBe(false);
	});

	it("acusa peso/dimensões faltando no passo logistics", () => {
		const issues = getStepIssues(EMPTY, "logistics");
		expect(issues.some((i) => i.path.includes("Peso"))).toBe(true);
	});

	it("passo identity fica sem issues quando nome+categoria estão preenchidos", () => {
		const ok = {
			...EMPTY,
			name: "Furadeira",
			categoryIds: ["c1"],
			primaryCategoryId: "c1",
		};
		expect(getStepIssues(ok, "identity")).toHaveLength(0);
	});

	it("STEP_FIELDS cobre exatamente os 6 passos", () => {
		expect(Object.keys(STEP_FIELDS).sort()).toEqual(
			["fiscal", "identity", "logistics", "publish", "specs", "variants"].sort()
		);
	});
});
