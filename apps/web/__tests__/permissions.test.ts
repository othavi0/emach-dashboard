import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	redirect: vi.fn((to: string) => {
		throw new Error(`__redirect__:${to}`);
	}),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: {
		select: vi.fn(),
	},
}));

import { db } from "@emach/db";
import {
	can,
	requireCapabilityWithContext,
	requireUserDetailAccessOrRedirect,
} from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

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

const sessionActive = {
	user: { id: "actor-1", status: "active", role: "user" },
} as never;
const sessionSuspended = {
	user: { id: "actor-1", status: "suspended", role: "user" },
} as never;

function mockTargetLookup(target: { role: string; status: string } | null) {
	const limit = vi.fn(() => Promise.resolve(target ? [target] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

function mockCountQuery(count: number) {
	const where = vi.fn(() => Promise.resolve([{ value: count }]));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

describe("requireCapabilityWithContext — guards mantidos", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionActive
		);
	});

	it("rejeita se status != active", async () => {
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionSuspended
		);
		await expect(
			requireCapabilityWithContext("tools.delete", {})
		).rejects.toThrow("Conta não ativa");
	});

	it("self-action guard: usuário não pode se suspender", async () => {
		await expect(
			requireCapabilityWithContext("users.suspend", { targetUserId: "actor-1" })
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard NÃO bloqueia caps fora de SELF_RESTRICTED", async () => {
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "actor-1",
			})
		).resolves.toBe(sessionActive);
	});

	it("last super_admin guard: rejeita se alvo é o último super_admin ativo", async () => {
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(0);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).rejects.toThrow("Necessário ao menos 1 super_admin ativo");
	});

	it("last super_admin guard: permite se há outros super_admin ativos", async () => {
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(2);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(sessionActive);
	});

	it("last super_admin guard: ignora alvo não-super_admin", async () => {
		mockTargetLookup({ role: "admin", status: "active" });
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(sessionActive);
	});
});

describe("requireUserDetailAccessOrRedirect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionActive
		);
	});

	it("libera self-view do detalhe do próprio usuário", async () => {
		await expect(
			requireUserDetailAccessOrRedirect("actor-1")
		).resolves.toBe(sessionActive);
	});
});
