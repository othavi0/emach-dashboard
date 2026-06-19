import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	can: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	fetchVariantBranchMovementsPage,
	getReservedQtyByVariantBranch,
	getStockMovements,
	getStockMovementsByVariantBranch,
} from "../movements-data";
import { getToolActivity } from "../tool-activity-data";

const FORBIDDEN = new Error('Forbidden: capability "stock.read" requerida');

describe("getStockMovements — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getStockMovements("tool-id")).rejects.toThrow("stock.read");
	});

	it("chama requireCapability com stock.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getStockMovements("tool-id")).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("stock.read");
	});
});

describe("getToolActivity — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getToolActivity("tool-id")).rejects.toThrow("stock.read");
	});

	it("chama requireCapability com stock.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getToolActivity("tool-id")).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("stock.read");
	});
});

describe("getStockMovementsByVariantBranch — guard", () => {
	it("rejeita quando requireCurrentSession lança", async () => {
		vi.mocked(requireCurrentSession).mockRejectedValueOnce(
			new Error("Unauthenticated")
		);
		await expect(
			getStockMovementsByVariantBranch("variant-id", "branch-id")
		).rejects.toThrow("Unauthenticated");
	});
});

describe("getReservedQtyByVariantBranch — guard", () => {
	it("rejeita quando requireCurrentSession lança", async () => {
		vi.mocked(requireCurrentSession).mockRejectedValueOnce(
			new Error("Unauthenticated")
		);
		await expect(
			getReservedQtyByVariantBranch("variant-id", "branch-id")
		).rejects.toThrow("Unauthenticated");
	});
});

describe("fetchVariantBranchMovementsPage — guard", () => {
	it("rejeita quando requireCurrentSession lança", async () => {
		vi.mocked(requireCurrentSession).mockRejectedValueOnce(
			new Error("Unauthenticated")
		);
		await expect(
			fetchVariantBranchMovementsPage("variant-id", "branch-id", null)
		).rejects.toThrow("Unauthenticated");
	});
});
