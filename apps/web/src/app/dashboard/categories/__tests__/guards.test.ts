import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import { getCategoryChildrenPage, getCategoryProductsPage } from "../actions";

const FORBIDDEN = new Error(
	'Forbidden: capability "categories.read" requerida'
);

describe("getCategoryProductsPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			getCategoryProductsPage({ categoryId: "cat-id", cursor: null })
		).rejects.toThrow("categories.read");
	});

	it("chama requireCapability com categories.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			getCategoryProductsPage({ categoryId: "cat-id", cursor: null })
		).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith(
			"categories.read"
		);
	});
});

describe("getCategoryChildrenPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			getCategoryChildrenPage({ categoryId: "cat-id", cursor: null })
		).rejects.toThrow("categories.read");
	});

	it("chama requireCapability com categories.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			getCategoryChildrenPage({ categoryId: "cat-id", cursor: null })
		).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith(
			"categories.read"
		);
	});
});
