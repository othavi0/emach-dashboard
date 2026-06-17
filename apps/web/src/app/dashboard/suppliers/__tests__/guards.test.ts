import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import { fetchSuppliersPage, fetchSuppliersTablePage } from "../actions";

const FORBIDDEN = new Error('Forbidden: capability "suppliers.read" requerida');
const FILTERS = { sort: "newest" as const };

describe("fetchSuppliersPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchSuppliersPage({ filters: FILTERS, cursor: null })
		).rejects.toThrow("suppliers.read");
	});

	it("chama requireCapability com suppliers.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchSuppliersPage({ filters: FILTERS, cursor: null })
		).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("suppliers.read");
	});
});

describe("fetchSuppliersTablePage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchSuppliersTablePage({ filters: FILTERS, cursor: null })
		).rejects.toThrow("suppliers.read");
	});

	it("chama requireCapability com suppliers.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchSuppliersTablePage({ filters: FILTERS, cursor: null })
		).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("suppliers.read");
	});
});
