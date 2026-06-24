import { describe, expect, it } from "vitest";
import type { AttributeValueInput } from "../tool-schema";
import {
	countFilledSpecs,
	MIN_SPECS_ACTIVE,
	toolFormSchema,
} from "../tool-schema";

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

	it("conta numeric_range preenchido só com valueNumericMax", () => {
		expect(countFilledSpecs({ a: { valueNumericMax: 50 } }, ["a"])).toBe(1);
	});

	it("NaN em valueNumericMax não conta", () => {
		expect(
			countFilledSpecs({ a: { valueNumericMax: Number.NaN } }, ["a"])
		).toBe(0);
	});
});

function baseTool(overrides: Record<string, unknown> = {}) {
	return {
		name: "Furadeira de impacto",
		status: "active" as const,
		weightKg: 2,
		lengthCm: 30,
		widthCm: 10,
		heightCm: 10,
		categoryIds: ["cat-1"],
		primaryCategoryId: "cat-1",
		images: [
			{ url: "https://x/1.jpg", sortOrder: 0 },
			{ url: "https://x/2.jpg", sortOrder: 1 },
			{ url: "https://x/3.jpg", sortOrder: 2 },
		],
		variants: [
			{
				sku: "SKU-1",
				barcode: "BAR-1",
				priceAmount: 100,
				isDefault: true,
				sortOrder: 0,
			},
		],
		attributeAssignments: ["a", "b", "c", "d"],
		attributeValues: {
			a: { valueText: "700W" },
			b: { valueText: "Bivolt" },
			c: { valueNumeric: 2 },
			d: { valueBool: true },
		},
		...overrides,
	};
}

describe("toolFormSchema — regra de specs ao ativar", () => {
	it("aceita active com 4 specs preenchidas", () => {
		const r = toolFormSchema.safeParse(baseTool());
		expect(r.success).toBe(true);
	});

	it("rejeita active com 3 specs preenchidas", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				attributeAssignments: ["a", "b", "c"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
				},
			})
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(
				r.error.issues.some((i) => String(i.path[0]) === "attributeValues")
			).toBe(true);
		}
	});

	it("aceita draft com 0 specs (regra só vale ao ativar)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				status: "draft",
				attributeAssignments: [],
				attributeValues: {},
				images: [],
			})
		);
		expect(r.success).toBe(true);
	});

	it("rejeita active quando há 4 vinculados mas só 3 preenchidos", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				attributeAssignments: ["a", "b", "c", "d"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
					d: { valueText: "" },
				},
			})
		);
		expect(r.success).toBe(false);
	});
});

describe("toolFormSchema — campos de vídeo", () => {
	it("aceita ferramenta sem vídeo (ambos null)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({ videoUrl: null, videoPosterUrl: null })
		);
		expect(r.success).toBe(true);
	});

	it("aceita par de vídeo completo", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				videoUrl: "https://x/v.mp4",
				videoPosterUrl: "https://x/p.webp",
			})
		);
		expect(r.success).toBe(true);
	});

	it("rejeita par incoerente (vídeo sem poster)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({ videoUrl: "https://x/v.mp4", videoPosterUrl: null })
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.error.issues.some((i) => String(i.path[0]) === "videoUrl")).toBe(
				true
			);
		}
	});
});

describe("toolFormSchema — barcode duplicado entre variantes", () => {
	it("rejeita duas variantes com o mesmo barcode", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [
					{
						sku: "S1",
						barcode: "DUP",
						priceAmount: 100,
						isDefault: true,
						sortOrder: 0,
					},
					{
						sku: "S2",
						barcode: "DUP",
						priceAmount: 100,
						isDefault: false,
						sortOrder: 1,
					},
				],
			})
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(
				r.error.issues.some(
					(i) => i.path[0] === "variants" && i.path[2] === "barcode"
				)
			).toBe(true);
		}
	});

	it("rejeita variante sem barcode", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [
					{ sku: "S1", priceAmount: 100, isDefault: true, sortOrder: 0 },
				],
			})
		);
		expect(r.success).toBe(false);
	});
});
