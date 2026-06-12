import { describe, expect, it } from "vitest";
import { stockStatus } from "../stock-status";

describe("stockStatus", () => {
	it("critical quando há mínimo e qty <= mínimo", () => {
		expect(stockStatus({ quantity: 2, minQty: 4, reorderPoint: 8 })).toBe(
			"critical"
		);
		expect(stockStatus({ quantity: 4, minQty: 4, reorderPoint: 8 })).toBe(
			"critical"
		);
	});

	it("reorder quando acima do mínimo mas <= ponto de reposição", () => {
		expect(stockStatus({ quantity: 6, minQty: 4, reorderPoint: 8 })).toBe(
			"reorder"
		);
	});

	it("ok quando acima do ponto de reposição", () => {
		expect(stockStatus({ quantity: 20, minQty: 4, reorderPoint: 8 })).toBe(
			"ok"
		);
	});

	it("none quando não há limites configurados", () => {
		expect(stockStatus({ quantity: 5, minQty: 0, reorderPoint: 0 })).toBe(
			"none"
		);
	});
});
