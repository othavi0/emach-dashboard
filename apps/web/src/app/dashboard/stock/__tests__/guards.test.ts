import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import { getStockMovements, getToolActivity } from "../actions";

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
