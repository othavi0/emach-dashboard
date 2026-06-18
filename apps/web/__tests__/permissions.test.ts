import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	redirect: vi.fn((to: string) => {
		throw new Error(`__redirect__:${to}`);
	}),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

vi.mock("@emach/db", () => ({
	db: {
		select: vi.fn(),
	},
}));

import { db } from "@emach/db";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
	requireUserDetailAccessOrRedirect,
	roleHasCapability,
} from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

const FORBIDDEN_REFUND_CAP_RE = /capability "orders\.refund"/;

describe("matriz de capability (3 níveis)", () => {
	it("super_admin pode tudo, inclusive exclusivos", () => {
		for (const cap of [
			"branches.manage",
			"users.delete",
			"tools.delete",
			"site.update_settings",
		] as const) {
			expect(roleHasCapability("super_admin", cap)).toBe(true);
		}
	});
	it("admin edita catálogo mas NÃO deleta", () => {
		expect(roleHasCapability("admin", "tools.create")).toBe(true);
		expect(roleHasCapability("admin", "tools.update")).toBe(true);
		expect(roleHasCapability("admin", "tools.delete")).toBe(false);
		expect(roleHasCapability("admin", "categories.delete")).toBe(false);
		expect(roleHasCapability("admin", "promotions.delete")).toBe(false);
	});
	it("admin NÃO acessa exclusivos de super_admin", () => {
		for (const cap of [
			"branches.manage",
			"users.delete",
			"site.update_settings",
			"site.update_banners",
		] as const) {
			expect(roleHasCapability("admin", cap)).toBe(false);
		}
	});
	it("admin gerencia usuários (não-delete) e modera", () => {
		expect(roleHasCapability("admin", "users.approve")).toBe(true);
		expect(roleHasCapability("admin", "users.suspend")).toBe(true);
		expect(roleHasCapability("admin", "reviews.moderate")).toBe(true);
		expect(roleHasCapability("admin", "orders.refund")).toBe(true);
	});
	it("user é operacional: lê, ajusta estoque, atualiza status — nada destrutivo", () => {
		expect(roleHasCapability("user", "orders.read")).toBe(true);
		expect(roleHasCapability("user", "stock.adjust")).toBe(true);
		expect(roleHasCapability("user", "orders.update_status")).toBe(true);
		expect(roleHasCapability("user", "tools.create")).toBe(false);
		expect(roleHasCapability("user", "orders.cancel")).toBe(false);
		expect(roleHasCapability("user", "reviews.moderate")).toBe(false);
		expect(roleHasCapability("user", "suppliers.manage")).toBe(true);
		expect(roleHasCapability("user", "customers.read")).toBe(false);
		expect(roleHasCapability("user", "reviews.read")).toBe(false);
		expect(roleHasCapability("user", "promotions.read")).toBe(false);
		expect(roleHasCapability("user", "site.read")).toBe(false);
	});
	it("role nula/desconhecida → nega", () => {
		expect(roleHasCapability(null, "orders.read")).toBe(false);
		expect(roleHasCapability("intruso", "orders.read" as never)).toBe(false);
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

function mockOverrides(rows: { capability: string; effect: string }[]) {
	const where = vi.fn(() => Promise.resolve(rows));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

function mockBranchRows(branchIds: string[]) {
	const where = vi.fn(() =>
		Promise.resolve(branchIds.map((branchId) => ({ branchId })))
	);
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
		const s = {
			user: { id: "guard-cap-1", status: "active", role: "user" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		mockOverrides([]);
		// role "user" NÃO tem orders.refund — deve barrar pela capability,
		// não passar batido só por estar ativo / sem contexto de filial.
		await expect(
			requireCapabilityWithContext("orders.refund", {})
		).rejects.toThrow(FORBIDDEN_REFUND_CAP_RE);
	});

	it("self-action guard: usuário não pode se suspender", async () => {
		const s = {
			user: { id: "guard-self-1", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		await expect(
			requireCapabilityWithContext("users.suspend", {
				targetUserId: "guard-self-1",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard: não gerencia as próprias permissões (permissions.manage)", async () => {
		const s = {
			user: { id: "guard-self-perm", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		await expect(
			requireCapabilityWithContext("permissions.manage", {
				targetUserId: "guard-self-perm",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard NÃO bloqueia caps fora de SELF_RESTRICTED", async () => {
		const s = {
			user: { id: "guard-self-2", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		await expect(
			requireCapabilityWithContext("users.update_branches", {
				targetUserId: "guard-self-2",
			})
		).resolves.toBe(s);
	});

	it("self-action guard: não reseta a própria senha", async () => {
		const s = {
			user: { id: "guard-self-reset", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "guard-self-reset",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard: não revoga as próprias sessões", async () => {
		const s = {
			user: { id: "guard-self-revoke", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		await expect(
			requireCapabilityWithContext("users.revoke_sessions", {
				targetUserId: "guard-self-revoke",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("last super_admin guard: rejeita se alvo é o último super_admin ativo", async () => {
		const s = {
			user: { id: "guard-lsa-1", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(0);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).rejects.toThrow("Necessário ao menos 1 super_admin ativo");
	});

	it("last super_admin guard: permite se há outros super_admin ativos", async () => {
		const s = {
			user: { id: "guard-lsa-2", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(2);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(s);
	});

	it("hierarquia: admin não gerencia usuário de role igual/superior", async () => {
		const s = {
			user: { id: "guard-hier-1", status: "active", role: "admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		mockOverrides([]);
		mockTargetLookup({ role: "admin", status: "active" });
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "other-admin",
			})
		).rejects.toThrow("role igual ou superior");
	});

	it("hierarquia: admin gerencia usuário de role user", async () => {
		const s = {
			user: { id: "guard-hier-2", status: "active", role: "admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		mockOverrides([]);
		mockTargetLookup({ role: "user", status: "active" });
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "other-user",
			})
		).resolves.toBe(s);
	});

	it("last super_admin guard: ignora alvo não-super_admin", async () => {
		const s = {
			user: { id: "guard-lsa-3", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		mockTargetLookup({ role: "admin", status: "active" });
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(s);
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

describe("getUserCapabilities — conjunto efetivo (role defaults ± overrides)", () => {
	beforeEach(() => vi.clearAllMocks());

	it("sem overrides = role default puro", async () => {
		// id único por teste para garantir cache miss do React.cache
		const s = {
			user: { id: "ovr-1", role: "admin", status: "active" },
		} as never;
		mockOverrides([]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("tools.create")).toBe(true);
		expect(caps.has("tools.delete")).toBe(false);
	});

	it("grant adiciona capability acima do role", async () => {
		const s = {
			user: { id: "ovr-2", role: "admin", status: "active" },
		} as never;
		mockOverrides([{ capability: "tools.delete", effect: "grant" }]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("tools.delete")).toBe(true);
	});

	it("revoke remove capability do role", async () => {
		const s = {
			user: { id: "ovr-3", role: "admin", status: "active" },
		} as never;
		mockOverrides([{ capability: "tools.create", effect: "revoke" }]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("tools.create")).toBe(false);
	});

	it("ignora override de cap fora do registry (fail-closed)", async () => {
		const s = {
			user: { id: "ovr-4", role: "admin", status: "active" },
		} as never;
		mockOverrides([{ capability: "legado.removido", effect: "grant" }]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("legado.removido" as never)).toBe(false);
	});

	it("super_admin ignora overrides: cap permanece mesmo com revoke gravado", async () => {
		const s = {
			user: { id: "ovr-sa-1", role: "super_admin", status: "active" },
		} as never;
		mockOverrides([{ capability: "permissions.manage", effect: "revoke" }]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("permissions.manage")).toBe(true);
		// Não busca overrides para super_admin (early-return antes do db.select).
		expect(db.select).not.toHaveBeenCalled();
	});
});

describe("requireCapabilityWithContext — branch-scoping (assertBranchScope)", () => {
	beforeEach(() => {
		// resetAllMocks (não clearAllMocks) para limpar a fila mockReturnValueOnce
		// que pode ter sobras de testes anteriores (ex: super_admin ignora overrides
		// chama mockOverrides mas não consome o slot — early-return antes do db.select).
		vi.resetAllMocks();
	});

	it("admin com targetBranchIds fora do escopo → rejeita", async () => {
		// ID único = cache miss em getUserBranchScope (React.cache).
		const s = {
			user: { id: "bs-admin-1", status: "active", role: "admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// 1º db.select: overrides (admin não tem early-return em getUserCapabilities).
		mockOverrides([]);
		// 2º db.select: userBranch rows → admin tem só b-sp.
		mockBranchRows(["b-sp"]);
		await expect(
			requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: ["b-rj"],
			})
		).rejects.toThrow("Filial fora do seu escopo: b-rj");
	});

	it("admin com targetBranchIds dentro do escopo → resolve", async () => {
		const s = {
			user: { id: "bs-admin-2", status: "active", role: "admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		mockOverrides([]);
		mockBranchRows(["b-sp"]);
		await expect(
			requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: ["b-sp"],
			})
		).resolves.toBe(s);
	});

	it("super_admin resolve para qualquer branch sem consultar escopo", async () => {
		const s = {
			user: { id: "bs-sa-1", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities E em assertBranchScope.
		// db.select NÃO deve ser chamado.
		await expect(
			requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: ["b-rj", "b-sp", "b-bh"],
			})
		).resolves.toBe(s);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("user sem vínculo (fail-closed) → rejeita para qualquer branch", async () => {
		// Fail-closed: getUserBranchScope retorna branchIds:[] + includeUnassigned:false.
		// Qualquer targetBranchIds → "Filial fora do seu escopo".
		const s = {
			user: { id: "bs-user-blind-1", status: "active", role: "user" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		mockOverrides([]);
		// Sem vínculo: DB retorna 0 rows.
		mockBranchRows([]);
		await expect(
			requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: ["b-sp"],
			})
		).rejects.toThrow("Filial fora do seu escopo: b-sp");
	});
});
