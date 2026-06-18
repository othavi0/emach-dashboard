import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapability } from "@/lib/permissions";
import { getCategory, listCategoriesForTree } from "../actions";

const FORBIDDEN = new Error(
	'Forbidden: capability "categories.read" requerida'
);

describe("getCategory — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getCategory("cat-id")).rejects.toThrow("categories.read");
	});

	it("chama requireCapability com categories.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getCategory("cat-id")).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith(
			"categories.read"
		);
	});
});

describe("listCategoriesForTree — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(listCategoriesForTree()).rejects.toThrow("categories.read");
	});

	it("chama requireCapability com categories.read como primeira instrução", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(listCategoriesForTree()).rejects.toThrow();
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith(
			"categories.read"
		);
	});
});
