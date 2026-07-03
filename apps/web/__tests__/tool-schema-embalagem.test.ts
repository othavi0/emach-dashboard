import { describe, expect, it } from "vitest";
import { toolFormSchema } from "@/app/dashboard/tools/_components/tool-schema";

// Input mínimo válido: status draft dispensa imagens/NCM/specs (superRefine).
const BASE = {
	name: "Furadeira X",
	status: "draft",
	weightKg: 2.5,
	lengthCm: 30,
	widthCm: 10,
	heightCm: 20,
	categoryIds: ["cat-1"],
	primaryCategoryId: "cat-1",
	visibleOnSite: true,
	images: [],
	variants: [
		{
			sku: "SKU-1",
			barcode: "789",
			priceAmount: 100,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
	attributeAssignments: [],
	videoUrl: null,
	videoPosterUrl: null,
};

describe("toolFormSchema — defaults de embalagem", () => {
	it("ausentes → 0 / true / false", () => {
		const r = toolFormSchema.safeParse(BASE);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(0);
			expect(r.data.stackable).toBe(true);
			expect(r.data.shipsInOwnBox).toBe(false);
		}
	});

	it("NaN no peso da embalagem → 0 (máscara vazia)", () => {
		const r = toolFormSchema.safeParse({
			...BASE,
			packagingWeightKg: Number.NaN,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(0);
		}
	});

	it("negativo → erro de validação", () => {
		const r = toolFormSchema.safeParse({ ...BASE, packagingWeightKg: -1 });
		expect(r.success).toBe(false);
	});

	it("valores explícitos preservados", () => {
		const r = toolFormSchema.safeParse({
			...BASE,
			packagingWeightKg: 1.5,
			stackable: false,
			shipsInOwnBox: true,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(1.5);
			expect(r.data.stackable).toBe(false);
			expect(r.data.shipsInOwnBox).toBe(true);
		}
	});
});
