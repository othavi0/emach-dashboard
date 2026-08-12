import { describe, expect, it } from "vitest";
import type { AttributeValueInput } from "../tool-schema";
import {
	activationRequirementIssues,
	collectToolIssues,
	countFilledSpecs,
	MIN_SPECS_ACTIVE,
	publishRequirementIssues,
	shouldEnforceActivation,
	toolFormSchema,
} from "../tool-schema";

const txt = (s: string): AttributeValueInput => ({ valueText: s });
const num = (n: number): AttributeValueInput => ({ valueNumeric: n });
const bool = (b: boolean): AttributeValueInput => ({ valueBool: b });

describe("shouldEnforceActivation — gate transicional (issue #290)", () => {
	it("draft→active: aplica o gate (transição de entrada)", () => {
		expect(shouldEnforceActivation("active", "draft")).toBe(true);
	});

	it("discontinued→active: aplica o gate (re-entrada em active)", () => {
		expect(shouldEnforceActivation("active", "discontinued")).toBe(true);
	});

	it("active→active: NÃO aplica — editar tool já-active não re-valida", () => {
		expect(shouldEnforceActivation("active", "active")).toBe(false);
	});

	it("active→draft: NÃO aplica — não está entrando em active", () => {
		expect(shouldEnforceActivation("draft", "active")).toBe(false);
	});

	it("draft→draft: NÃO aplica", () => {
		expect(shouldEnforceActivation("draft", "draft")).toBe(false);
	});
});

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
		ncm: "84672100",
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

describe("activationRequirementIssues", () => {
	it("retorna vazio quando specs≥4 e imagens≥3", () => {
		expect(
			activationRequirementIssues(toolFormSchema.parse(baseTool()))
		).toEqual([]);
	});

	it("aponta specs quando há menos de 4 preenchidas", () => {
		const data = toolFormSchema.parse(
			baseTool({
				attributeAssignments: ["a", "b", "c"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
				},
			})
		);
		expect(
			activationRequirementIssues(data).some(
				(i) => i.path[0] === "attributeValues"
			)
		).toBe(true);
	});

	it("ncm ausente NÃO bloqueia ativação (emenda 2026-07-28 ao ADR-0027)", () => {
		const data = toolFormSchema.parse(baseTool({ ncm: undefined }));
		expect(
			activationRequirementIssues(data).some((i) => i.path[0] === "ncm")
		).toBe(false);
	});

	it("aponta imagens abaixo do mínimo", () => {
		const data = toolFormSchema.parse(
			baseTool({ images: [{ url: "https://x/1.jpg", sortOrder: 0 }] })
		);
		expect(
			activationRequirementIssues(data).some((i) => i.path[0] === "images")
		).toBe(true);
	});
});

describe("collectToolIssues", () => {
	it("sem enforceActivation, active com 2 specs não gera issues", () => {
		const values = baseTool({
			attributeAssignments: ["a", "b"],
			attributeValues: { a: { valueText: "x" }, b: { valueText: "y" } },
		});
		expect(collectToolIssues(values, { enforceActivation: false })).toEqual([]);
	});

	it("com enforceActivation, active com 2 specs gera issue de specs", () => {
		const values = baseTool({
			attributeAssignments: ["a", "b"],
			attributeValues: { a: { valueText: "x" }, b: { valueText: "y" } },
		});
		const issues = collectToolIssues(values, { enforceActivation: true });
		expect(issues.some((i) => i.path[0] === "attributeValues")).toBe(true);
	});

	it("requisito de publicação (variante sem barcode em tool active) aparece independente de enforceActivation", () => {
		const values = baseTool({
			variants: [
				{ sku: "S1", priceAmount: 100, isDefault: true, sortOrder: 0 },
			],
		});
		const issues = collectToolIssues(values, { enforceActivation: false });
		expect(issues.some((i) => i.path[0] === "variants")).toBe(true);
	});
});

describe("toolFormSchema — rascunho leve (só nome obrigatório)", () => {
	function draftMinimal(overrides: Record<string, unknown> = {}) {
		return {
			name: "Ferramenta em rascunho",
			status: "draft" as const,
			categoryIds: [],
			primaryCategoryId: "",
			images: [],
			variants: [],
			attributeAssignments: [],
			attributeValues: {},
			...overrides,
		};
	}

	it("rascunho só com nome passa", () => {
		expect(toolFormSchema.safeParse(draftMinimal()).success).toBe(true);
	});

	it("rascunho sem nome falha", () => {
		const r = toolFormSchema.safeParse(draftMinimal({ name: "" }));
		expect(r.success).toBe(false);
	});

	it("linha pristine do editor de variantes é filtrada (não exige SKU)", () => {
		const r = toolFormSchema.safeParse(
			draftMinimal({
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
			})
		);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.variants).toEqual([]);
		}
	});

	it("variante COM conteúdo continua exigindo SKU", () => {
		const r = toolFormSchema.safeParse(
			draftMinimal({
				variants: [
					{
						sku: "",
						barcode: "789",
						priceAmount: 0,
						isDefault: true,
						sortOrder: 0,
					},
				],
			})
		);
		expect(r.success).toBe(false);
	});

	it("rascunho aceita variante com SKU e sem barcode/preço", () => {
		const r = toolFormSchema.safeParse(
			draftMinimal({
				variants: [{ sku: "SKU-1", isDefault: true, sortOrder: 0 }],
			})
		);
		expect(r.success).toBe(true);
	});

	it("primária fora das categorias continua estrutural (falha mesmo em rascunho)", () => {
		const r = toolFormSchema.safeParse(
			draftMinimal({ categoryIds: ["cat-1"], primaryCategoryId: "cat-2" })
		);
		expect(r.success).toBe(false);
	});

	it("rascunho não gera issues de publicação no collectToolIssues", () => {
		expect(
			collectToolIssues(draftMinimal(), { enforceActivation: false })
		).toEqual([]);
	});
});

describe("publishRequirementIssues — exigências de tool active", () => {
	it("tool completa não gera issues", () => {
		expect(publishRequirementIssues(toolFormSchema.parse(baseTool()))).toEqual(
			[]
		);
	});

	it("peso/dimensões ausentes apontam cada campo", () => {
		const data = toolFormSchema.parse(
			baseTool({ weightKg: undefined, heightCm: undefined })
		);
		const paths = publishRequirementIssues(data).map((i) => i.path[0]);
		expect(paths).toContain("weightKg");
		expect(paths).toContain("heightCm");
		expect(paths).not.toContain("lengthCm");
	});

	it("sem categorias aponta categoryIds e primaryCategoryId", () => {
		const data = toolFormSchema.parse(
			baseTool({ categoryIds: [], primaryCategoryId: "" })
		);
		const paths = publishRequirementIssues(data).map((i) => i.path[0]);
		expect(paths).toContain("categoryIds");
		expect(paths).toContain("primaryCategoryId");
	});

	it("sem variantes aponta variants", () => {
		const data = toolFormSchema.parse(baseTool({ variants: [] }));
		expect(
			publishRequirementIssues(data).some((i) => i.path[0] === "variants")
		).toBe(true);
	});

	it("variante sem preço aponta variants", () => {
		const data = toolFormSchema.parse(
			baseTool({
				variants: [
					{ sku: "S1", barcode: "789", isDefault: true, sortOrder: 0 },
				],
			})
		);
		expect(
			publishRequirementIssues(data).some((i) => i.path[0] === "variants")
		).toBe(true);
	});

	it("editar tool active não consegue limpar o peso (gate vale sem transição)", () => {
		const values = baseTool({ weightKg: undefined });
		const issues = collectToolIssues(values, { enforceActivation: false });
		expect(issues.some((i) => i.path[0] === "weightKg")).toBe(true);
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

	it("variante sem barcode passa no schema (vira exigência de publicação)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [
					{ sku: "S1", priceAmount: 100, isDefault: true, sortOrder: 0 },
				],
			})
		);
		expect(r.success).toBe(true);
	});

	it("rejeita barcode duplicado após trim ('BAR' e 'BAR ')", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [
					{
						sku: "S1",
						barcode: "BAR",
						priceAmount: 100,
						isDefault: true,
						sortOrder: 0,
					},
					{
						sku: "S2",
						barcode: "BAR ",
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
});
