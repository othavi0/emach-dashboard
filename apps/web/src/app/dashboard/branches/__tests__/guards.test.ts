import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import {
	fetchBranchActivityPage,
	fetchBranchesPage,
	fetchBranchesTablePage,
	getBranch,
	listBranches,
} from "../actions";

const FORBIDDEN = new Error('Forbidden: capability "branches.read" requerida');

describe("listBranches — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(listBranches()).rejects.toThrow("branches.read");
	});

	it("chama requireCapability com branches.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(listBranches()).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("branches.read");
	});
});

describe("fetchBranchesPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchBranchesPage({ filters: { sort: "newest" }, cursor: null })
		).rejects.toThrow("branches.read");
	});
});

describe("getBranch — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getBranch("any-id")).rejects.toThrow("branches.read");
	});
});

describe("fetchBranchesTablePage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchBranchesTablePage({ filters: { sort: "newest" }, cursor: null })
		).rejects.toThrow("branches.read");
	});
});

describe("fetchBranchActivityPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchBranchActivityPage(
				{ branchId: "b1", kinds: ["stock"], period: "7d" },
				null
			)
		).rejects.toThrow("branches.read");
	});
});
