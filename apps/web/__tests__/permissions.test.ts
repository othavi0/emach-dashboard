import { describe, expect, it } from "vitest";
import { type Capability, can } from "@/lib/permissions";

describe("can()", () => {
	it("admin tem capabilities amplas (exceto exclusivas de super_admin)", () => {
		const caps: Capability[] = [
			"tools.delete",
			"users.manage",
			"customers.export",
			"orders.refund",
			"site.update_settings",
		];
		for (const cap of caps) {
			expect(can("admin", cap)).toBe(true);
		}
	});

	it("manager tem orders.cancel e orders.refund", () => {
		expect(can("manager", "orders.cancel")).toBe(true);
		expect(can("manager", "orders.refund")).toBe(true);
	});

	it("manager NÃO tem branches.manage / users.manage / customers.export", () => {
		expect(can("manager", "branches.manage")).toBe(false);
		expect(can("manager", "users.manage")).toBe(false);
		expect(can("manager", "customers.export")).toBe(false);
	});

	it("user (estoquista) tem stock.adjust + orders.update_status + orders.add_note", () => {
		expect(can("user", "stock.adjust")).toBe(true);
		expect(can("user", "orders.update_status")).toBe(true);
		expect(can("user", "orders.add_note")).toBe(true);
	});

	it("user NÃO tem orders.cancel / tools.create / customers.update_status", () => {
		expect(can("user", "orders.cancel")).toBe(false);
		expect(can("user", "tools.create")).toBe(false);
		expect(can("user", "customers.update_status")).toBe(false);
	});

	it("user tem todas as reads", () => {
		const reads: Capability[] = [
			"tools.read",
			"categories.read",
			"orders.read",
			"customers.read",
			"site.read",
			"reviews.read",
		];
		for (const cap of reads) {
			expect(can("user", cap)).toBe(true);
		}
	});

	it("manager tem customers.update_status / manage_sessions / reset_password", () => {
		expect(can("manager", "customers.update_status")).toBe(true);
		expect(can("manager", "customers.manage_sessions")).toBe(true);
		expect(can("manager", "customers.reset_password")).toBe(true);
	});

	it("admin tem customers.export; manager NÃO", () => {
		expect(can("admin", "customers.export")).toBe(true);
		expect(can("manager", "customers.export")).toBe(false);
	});

	it("caps mortas removidas (leads.*, customers.update_tags, customers.delete)", () => {
		// @ts-expect-error: cap removida
		expect(can("admin", "leads.read")).toBe(false);
		// @ts-expect-error: cap removida
		expect(can("admin", "customers.update_tags")).toBe(false);
		// @ts-expect-error: cap removida
		expect(can("admin", "customers.delete")).toBe(false);
	});

	it("retorna false para role null/undefined/desconhecida", () => {
		expect(can(null, "tools.read")).toBe(false);
		expect(can(undefined, "tools.read")).toBe(false);
		expect(can("hacker", "tools.read")).toBe(false);
	});
});

describe("super_admin caps", () => {
	it("super_admin tem todas as capabilities críticas", () => {
		const caps: Capability[] = [
			"branches.manage",
			"users.approve",
			"users.delete",
			"users.update_role",
			"users.update_branches",
			"users.suspend",
			"users.reset_password",
		];
		for (const cap of caps) {
			expect(can("super_admin", cap)).toBe(true);
		}
	});

	it("admin NÃO tem users.delete nem branches.manage", () => {
		expect(can("admin", "users.delete")).toBe(false);
		expect(can("admin", "branches.manage")).toBe(false);
	});

	it("admin tem users.approve, users.suspend, users.update_role, users.update_branches", () => {
		expect(can("admin", "users.approve")).toBe(true);
		expect(can("admin", "users.suspend")).toBe(true);
		expect(can("admin", "users.update_role")).toBe(true);
		expect(can("admin", "users.update_branches")).toBe(true);
	});

	it("manager NÃO tem caps de users", () => {
		expect(can("manager", "users.approve")).toBe(false);
		expect(can("manager", "users.suspend")).toBe(false);
		expect(can("manager", "users.delete")).toBe(false);
	});

	it("user NÃO tem caps de users", () => {
		expect(can("user", "users.approve")).toBe(false);
	});
});

describe("users.revoke_sessions", () => {
	it("admin pode revogar sessões", () => {
		expect(can("admin", "users.revoke_sessions")).toBe(true);
	});
	it("super_admin pode revogar sessões", () => {
		expect(can("super_admin", "users.revoke_sessions")).toBe(true);
	});
	it("manager NÃO pode revogar sessões", () => {
		expect(can("manager", "users.revoke_sessions")).toBe(false);
	});
	it("user NÃO pode revogar sessões", () => {
		expect(can("user", "users.revoke_sessions")).toBe(false);
	});
});
