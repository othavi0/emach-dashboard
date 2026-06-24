import { describe, expect, it } from "vitest";
import { groupStockByVariant } from "../stock-grouping";
import type { ToolStockRow } from "../tool-detail-data";

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

describe("groupStockByVariant", () => {
	it("agrupa por variante e ordena com a default primeiro, depois por sortOrder", () => {
		const rows = [
			cell({ variantId: "v220", variantSku: "S-220", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b2" }),
		];
		const order = [
			{ id: "v220", isDefault: false, sortOrder: 1 },
			{ id: "v127", isDefault: true, sortOrder: 0 },
		];
		const groups = groupStockByVariant(rows, order);
		expect(groups.map((g) => g.variantId)).toEqual(["v127", "v220"]);
		expect(groups[0]?.variantSku).toBe("S-127");
		expect(groups[0]?.branches).toHaveLength(2);
		expect(groups[1]?.branches).toHaveLength(1);
	});

	it("ignora variantes sem nenhuma célula de estoque", () => {
		const rows = [cell({ variantId: "v1" })];
		const order = [
			{ id: "v1", isDefault: true, sortOrder: 0 },
			{ id: "v2", isDefault: false, sortOrder: 1 },
		];
		const groups = groupStockByVariant(rows, order);
		expect(groups.map((g) => g.variantId)).toEqual(["v1"]);
	});

	it("devolve [] para entrada vazia", () => {
		expect(groupStockByVariant([], [])).toEqual([]);
	});
});
