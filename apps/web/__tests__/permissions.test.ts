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

describe("matriz de capability (3 níveis)", () => {
	it("super_admin pode tudo, inclusive exclusivos", () => {
		for (const cap of [
			"branches.manage",
			"users.delete",
			"tools.delete",
			"site.update_settings",
		] as const) {
			expect(can("super_admin", cap)).toBe(true);
		}
	});
	it("admin edita catálogo mas NÃO deleta", () => {
		expect(can("admin", "tools.create")).toBe(true);
		expect(can("admin", "tools.update")).toBe(true);
		expect(can("admin", "tools.delete")).toBe(false);
		expect(can("admin", "categories.delete")).toBe(false);
		expect(can("admin", "promotions.delete")).toBe(false);
	});
	it("admin NÃO acessa exclusivos de super_admin", () => {
		for (const cap of [
			"branches.manage",
			"users.delete",
			"site.update_settings",
			"site.update_banners",
		] as const) {
			expect(can("admin", cap)).toBe(false);
		}
	});
	it("admin gerencia usuários (não-delete) e modera", () => {
		expect(can("admin", "users.approve")).toBe(true);
		expect(can("admin", "users.suspend")).toBe(true);
		expect(can("admin", "reviews.moderate")).toBe(true);
		expect(can("admin", "orders.refund")).toBe(true);
	});
	it("user é operacional: lê, ajusta estoque, atualiza status — nada destrutivo", () => {
		expect(can("user", "orders.read")).toBe(true);
		expect(can("user", "stock.adjust")).toBe(true);
		expect(can("user", "orders.update_status")).toBe(true);
		expect(can("user", "tools.create")).toBe(false);
		expect(can("user", "orders.cancel")).toBe(false);
		expect(can("user", "reviews.moderate")).toBe(false);
	});
	it("manager é alias de admin", () => {
		expect(can("manager", "tools.create")).toBe(true);
		expect(can("manager", "tools.delete")).toBe(false);
	});
	it("role nula/desconhecida → nega", () => {
		expect(can(null, "orders.read")).toBe(false);
		expect(can("intruso", "orders.read" as never)).toBe(false);
	});
});

const sessionActive = {
	user: { id: "actor-1", status: "active", role: "user" },
} as never;
const sessionSuspended = {
	user: { id: "actor-1", status: "suspended", role: "user" },
} as never;
const sessionSuperAdmin = {
	user: { id: "actor-1", status: "active", role: "super_admin" },
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
			sessionSuperAdmin
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

	it("gate de capability: role sem a cap é rejeitado (regressão P0)", async () => {
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionActive
		);
		// role "user" NÃO tem orders.refund — deve barrar pela capability,
		// não passar batido só por estar ativo / sem contexto de filial.
		await expect(
			requireCapabilityWithContext("orders.refund", {})
		).rejects.toThrow(/capability "orders.refund"/);
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
		).resolves.toBe(sessionSuperAdmin);
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
		).resolves.toBe(sessionSuperAdmin);
	});

	it("last super_admin guard: ignora alvo não-super_admin", async () => {
		mockTargetLookup({ role: "admin", status: "active" });
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(sessionSuperAdmin);
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
		await expect(requireUserDetailAccessOrRedirect("actor-1")).resolves.toBe(
			sessionActive
		);
	});
});
