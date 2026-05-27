import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("can() — no-op pós ADR-0012", () => {
	it("retorna true para qualquer role válida + qualquer capability", () => {
		expect(can("super_admin", "tools.delete")).toBe(true);
		expect(can("admin", "users.delete")).toBe(true);
		expect(can("manager", "branches.manage")).toBe(true);
		expect(can("user", "orders.refund")).toBe(true);
		expect(can("user", "customers.export")).toBe(true);
	});

	it("retorna false para role null/undefined/string vazia", () => {
		expect(can(null, "tools.read")).toBe(false);
		expect(can(undefined, "tools.read")).toBe(false);
		expect(can("", "tools.read")).toBe(false);
	});

	it("retorna true para string arbitrária não vazia (no-op não inspeciona role)", () => {
		// Comportamento aceito do no-op: só rejeita falsy. Cobertura real é status gate.
		expect(can("hacker", "tools.read")).toBe(true);
	});
});
