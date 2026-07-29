import { describe, expect, it } from "vitest";
import { groupStockByVariant } from "../stock-grouping";
import type { ToolDetailBranch, ToolStockRow } from "../tool-detail-data";

function cell(p: Partial<ToolStockRow>): ToolStockRow {
	return {
		branchId: "b1",
		branchName: "Matriz",
		branchCity: "São Paulo",
		branchState: "SP",
		minQty: 0,
		quantity: 0,
		reorderPoint: 0,
		variantBarcode: "0000000000000",
		variantId: "v1",
		variantSku: "SKU-1",
		variantVoltage: null,
		...p,
	};
}

function variant(p: {
	id: string;
	isDefault: boolean;
	sku?: string;
	sortOrder: number;
}) {
	return {
		barcode: "0000000000000",
		sku: p.sku ?? `SKU-${p.id}`,
		voltage: null,
		...p,
	};
}

const BRANCHES: ToolDetailBranch[] = [
	{ id: "b1", name: "Matriz", city: "São Paulo", state: "SP" },
	{ id: "b2", name: "Norte", city: "Curitiba", state: "PR" },
];

describe("groupStockByVariant", () => {
	it("agrupa por variante e ordena com a default primeiro, depois por sortOrder", () => {
		const rows = [
			cell({ variantId: "v220", variantSku: "S-220", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b2" }),
		];
		const variants = [
			variant({ id: "v220", isDefault: false, sku: "S-220", sortOrder: 1 }),
			variant({ id: "v127", isDefault: true, sku: "S-127", sortOrder: 0 }),
		];
		const groups = groupStockByVariant(rows, variants, []);
		expect(groups.map((g) => g.variantId)).toEqual(["v127", "v220"]);
		expect(groups[0]?.variantSku).toBe("S-127");
		expect(groups[0]?.branches).toHaveLength(2);
		expect(groups[1]?.branches).toHaveLength(1);
	});

	it("inclui variante sem célula, com todas as filiais como fantasma", () => {
		const rows = [cell({ variantId: "v1", branchId: "b1" })];
		const variants = [
			variant({ id: "v1", isDefault: true, sortOrder: 0 }),
			variant({ id: "v2", isDefault: false, sortOrder: 1 }),
		];
		const groups = groupStockByVariant(rows, variants, BRANCHES);
		expect(groups.map((g) => g.variantId)).toEqual(["v1", "v2"]);
		expect(groups[1]?.branches).toHaveLength(0);
		expect(groups[1]?.ghostBranches.map((b) => b.id)).toEqual(["b1", "b2"]);
		expect(groups[1]?.variantSku).toBe("SKU-v2");
	});

	it("filial vinculada não vira fantasma na mesma variante", () => {
		const rows = [cell({ variantId: "v1", branchId: "b1" })];
		const variants = [variant({ id: "v1", isDefault: true, sortOrder: 0 })];
		const groups = groupStockByVariant(rows, variants, BRANCHES);
		expect(groups[0]?.branches.map((r) => r.branchId)).toEqual(["b1"]);
		expect(groups[0]?.ghostBranches.map((b) => b.id)).toEqual(["b2"]);
	});

	it("sem filiais visíveis, variante sem célula fica sem fantasmas", () => {
		const variants = [variant({ id: "v1", isDefault: true, sortOrder: 0 })];
		const groups = groupStockByVariant([], variants, []);
		expect(groups[0]?.branches).toHaveLength(0);
		expect(groups[0]?.ghostBranches).toHaveLength(0);
	});

	it("devolve [] para entrada vazia", () => {
		expect(groupStockByVariant([], [], [])).toEqual([]);
	});
});
