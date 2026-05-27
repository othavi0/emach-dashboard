import { describe, expect, it } from "vitest";

import { getUserBranchScope, inScope } from "@/lib/branch-scope";

describe("inScope()", () => {
	it("retorna true quando scope é null (sempre, pós ADR-0012)", () => {
		expect(inScope(null, "any-id")).toBe(true);
	});

	it("retorna true quando id está no scope", () => {
		expect(inScope(["a", "b"], "a")).toBe(true);
	});

	it("retorna false quando id fora do scope", () => {
		expect(inScope(["a", "b"], "c")).toBe(false);
	});
});

describe("getUserBranchScope()", () => {
	it("retorna null para super_admin", async () => {
		const session = {
			user: { id: "u1", role: "super_admin" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});

	it("retorna null para qualquer outra role (no-op pós ADR-0012)", async () => {
		const session = {
			user: { id: "u2", role: "user" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});
});
