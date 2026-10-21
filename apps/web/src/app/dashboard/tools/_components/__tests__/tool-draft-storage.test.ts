import type { JsonValue } from "@emach/db/utils";
import { describe, expect, it } from "vitest";
import {
	DRAFT_TTL_MS,
	parseDraft,
	serializeDraft,
	shouldPersist,
} from "../tool-draft-storage";
import { EMPTY_TOOL_VALUES, type ToolFormState } from "../tool-form-state";

const base = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };

describe("serializeDraft / parseDraft", () => {
	it("round-trip preserva os dados", () => {
		const raw = serializeDraft(base, 1000);
		expect(parseDraft(raw, 1000)?.name).toBe("Furadeira");
	});

	it("expira após 24h", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS + 1)).toBeNull();
	});

	it("dentro de 24h retorna os dados", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS - 1)).not.toBeNull();
	});

	it("raw null → null", () => {
		expect(parseDraft(null, 0)).toBeNull();
	});

	it("json inválido → null", () => {
		expect(parseDraft("{bad", 0)).toBeNull();
	});
});

const filled: ToolFormState = {
	...EMPTY_TOOL_VALUES,
	name: "Furadeira de impacto",
	description: "650 W",
	status: "active",
	powerWatts: 650,
	weightKg: 1.8,
	lengthCm: 30,
	widthCm: 8,
	heightCm: 22,
	packagingWeightKg: 0.2,
	stackable: false,
	model: "GSB 13 RE",
	invoiceModel: "GSB13RE",
	manufacturerName: "Bosch",
	hsCode: "846721",
	ncm: "84672100",
	cest: "0800100",
	shipsInOwnBox: true,
	visibleOnSite: false,
	categoryIds: ["cat-1", "cat-2"],
	primaryCategoryId: "cat-1",
	images: [
		{ id: "img-1", url: "https://x.supabase.co/a.webp", sortOrder: 0 },
		{ url: "https://x.supabase.co/b.webp", sortOrder: 1 },
	],
	videoUrl: "https://youtu.be/abc",
	videoPosterUrl: "https://x.supabase.co/poster.webp",
	variants: [
		{
			id: "var-1",
			sku: "FUR-127",
			barcode: "7890000000001",
			voltage: "127V",
			priceAmount: 199.9,
			isDefault: true,
			visibleOnSite: true,
			sortOrder: 0,
		},
		{
			sku: "",
			barcode: "",
			voltage: "",
			priceAmount: 0,
			isDefault: false,
			visibleOnSite: true,
			sortOrder: 1,
		},
	],
	attributeValues: {
		potencia: { valueNumeric: 650, valueText: null },
		bateria: { valueBool: false },
	},
	attributeAssignments: ["potencia", "bateria"],
};

function rawDraft(data: JsonValue, savedAt = 0): string {
	return JSON.stringify({ data, savedAt });
}

describe("parseDraft decodifica o ToolFormState", () => {
	it("form preenchido volta igual ao que foi gravado", () => {
		expect(parseDraft(serializeDraft(filled, 0), 0)).toEqual(filled);
	});

	it("form vazio volta igual ao EMPTY_TOOL_VALUES", () => {
		expect(parseDraft(serializeDraft(EMPTY_TOOL_VALUES, 0), 0)).toEqual(
			EMPTY_TOOL_VALUES
		);
	});

	it("campo ausente cai no default do EMPTY_TOOL_VALUES", () => {
		expect(parseDraft(rawDraft({ name: "Serra", ncm: "8467" }), 0)).toEqual({
			...EMPTY_TOOL_VALUES,
			name: "Serra",
			ncm: "8467",
		});
	});

	it("data {} restaura o form vazio", () => {
		expect(parseDraft(rawDraft({}), 0)).toEqual(EMPTY_TOOL_VALUES);
	});

	it("número NaN, gravado como null pelo JSON, volta como vazio", () => {
		expect(parseDraft(rawDraft({ name: "Serra", weightKg: null }), 0)).toEqual({
			...EMPTY_TOOL_VALUES,
			name: "Serra",
		});
	});

	it("chave que o form não conhece é descartada", () => {
		expect(parseDraft(rawDraft({ name: "Serra", legacy: 1 }), 0)).toEqual({
			...EMPTY_TOOL_VALUES,
			name: "Serra",
		});
	});

	it.each([
		["string", "x"],
		["array", ["x"]],
		["número", 5],
		["null", null],
		["true", true],
	])("data %s → null", (_label, data) => {
		expect(parseDraft(rawDraft(data), 0)).toBeNull();
	});

	it("sem data → null", () => {
		expect(parseDraft(JSON.stringify({ savedAt: 0 }), 0)).toBeNull();
	});

	it("savedAt não numérico → null", () => {
		expect(
			parseDraft(JSON.stringify({ data: { name: "x" }, savedAt: "0" }), 0)
		).toBeNull();
	});

	it("campo com tipo errado → null", () => {
		expect(parseDraft(rawDraft({ name: 42 }), 0)).toBeNull();
		expect(parseDraft(rawDraft({ variants: "FUR-127" }), 0)).toBeNull();
		expect(parseDraft(rawDraft({ status: "publicado" }), 0)).toBeNull();
	});
});

describe("shouldPersist", () => {
	it("false para form vazio", () => {
		expect(shouldPersist(EMPTY_TOOL_VALUES)).toBe(false);
	});

	it("true quando há conteúdo", () => {
		expect(shouldPersist(base)).toBe(true);
	});
});
