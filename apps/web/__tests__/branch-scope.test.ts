import { describe, expect, it, vi } from "vitest";

vi.mock("@emach/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		})),
	},
}));

import { getUserBranchScope, inScope } from "@/lib/branch-scope";

describe("inScope()", () => {
	it("retorna true quando scope é null (super_admin)", () => {
		expect(inScope(null, "any-id")).toBe(true);
	});

	it("retorna true quando id está no scope", () => {
		expect(inScope(["a", "b"], "a")).toBe(true);
	});

	it("retorna false quando id fora do scope", () => {
		expect(inScope(["a", "b"], "c")).toBe(false);
	});

	it("retorna false quando scope vazio", () => {
		expect(inScope([], "a")).toBe(false);
	});
});

describe("getUserBranchScope()", () => {
	it("retorna null para super_admin sem consultar DB", async () => {
		const session = {
			user: { id: "u1", role: "super_admin" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});
});
