import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

vi.mock("@/lib/permissions", () => ({
	requireCapabilityWithContext: vi.fn(),
	getUserCapabilities: vi.fn(),
}));

// Mocks sem tipo de propósito: cada teste devolve só a cadeia que a action
// usa (from/where/limit, values/onConflictDoUpdate, where), não o builder do
// Drizzle.
const { dbSelect, dbInsert, dbDelete } = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
	dbDelete: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { select: dbSelect, insert: dbInsert, delete: dbDelete },
}));

import { setUserCapability } from "@/app/dashboard/users/[id]/permissions/actions";
import { makeSession } from "@/lib/__tests__/fixtures/make-session";
import { logUserActivity } from "@/lib/activity";
import type { Capability } from "@/lib/capabilities";
import { logger } from "@/lib/logger";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const actorAdmin = makeSession({
	id: "actor-admin",
	role: "admin",
	status: "active",
});

const actorSuperAdmin = makeSession({
	id: "actor-sa",
	role: "super_admin",
	status: "active",
});

function mockActorCapabilities(caps: Capability[]) {
	vi.mocked(getUserCapabilities).mockResolvedValue(new Set(caps));
}

function mockTargetBranches(ids: string[]) {
	const where = vi.fn(() =>
		Promise.resolve(ids.map((branchId) => ({ branchId })))
	);

	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

// 1º db.select da action: role do alvo (guard super_admin da issue #184).
function mockTargetRole(role: string | null) {
	const limit = vi.fn(() => Promise.resolve(role ? [{ role }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

// 3º db.select da action: estado anterior do override (para o `before` do audit).
function mockExistingOverride(effect: string | null) {
	const limit = vi.fn(() => Promise.resolve(effect ? [{ effect }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCapabilityWithContext).mockResolvedValue(actorAdmin);
});

describe("setUserCapability — teto e validações", () => {
	it("rejeita capability fora do registry", async () => {
		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "foo.bar",
			state: "grant",
		});

		expect(r.ok).toBe(false);
	});

	it("anti-escalada: ator não pode conceder cap que ele não tem", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.delete",
			state: "grant",
		});

		expect(r.ok).toBe(false);
	});

	it("alvo sem filial: admin (não super_admin) é barrado (fail-closed)", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches([]);

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "grant",
		});

		expect(r.ok).toBe(false);
		expect(dbInsert).not.toHaveBeenCalled();
	});

	it("grant válido: ator tem a cap e alvo no escopo → insere + audita", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride(null);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "grant",
		});

		expect(r.ok).toBe(true);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "permission.granted",
				targetId: "u1",
				metadata: expect.objectContaining({ before: "inherit" }),
			})
		);
	});

	it("inherit: remove a linha de override", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride("grant");
		const where = vi.fn(() => Promise.resolve());
		dbDelete.mockReturnValue({ where });

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "inherit",
		});

		expect(r.ok).toBe(true);
		expect(dbDelete).toHaveBeenCalled();
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.reset", targetId: "u1" })
		);
	});

	it("revoke válido: insere effect=revoke e audita permission.revoked", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride(null);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "revoke",
		});

		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ effect: "revoke" })
		);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.revoked", targetId: "u1" })
		);
	});

	it("erro de banco: retorna ok:false genérico (não vaza)", async () => {
		mockActorCapabilities(["tools.create"]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride(null);
		dbInsert.mockImplementation(() => {
			throw new Error("violates foreign key constraint xyz");
		});

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "grant",
		});

		expect(r.ok).toBe(false);

		if (!r.ok) {
			expect(r.error).not.toContain("foreign key");
		}

		expect(logger.error).toHaveBeenCalledWith(
			"setUserCapability",
			expect.any(Error)
		);
	});

	it("revoke: ator SEM a cap, alvo gerenciável → sucesso + audit permission.revoked", async () => {
		mockActorCapabilities([]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride(null);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.delete",
			state: "revoke",
		});

		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ effect: "revoke" })
		);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.revoked" })
		);
		expect(getUserCapabilities).not.toHaveBeenCalled();
	});

	it("inherit: ator SEM a cap, alvo gerenciável → sucesso (delete) + audit permission.reset", async () => {
		mockActorCapabilities([]);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride("grant");
		const where = vi.fn(() => Promise.resolve());
		dbDelete.mockReturnValue({ where });

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.delete",
			state: "inherit",
		});

		expect(r.ok).toBe(true);
		expect(dbDelete).toHaveBeenCalled();
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.reset" })
		);
		expect(getUserCapabilities).not.toHaveBeenCalled();
	});

	it("revoke: guards continuam barrando — requireCapabilityWithContext lança → ok:false, sem mutação", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValue(
			new Error("Forbidden")
		);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);

		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.delete",
			state: "revoke",
		});

		expect(r.ok).toBe(false);
		expect(dbInsert).not.toHaveBeenCalled();
		expect(dbDelete).not.toHaveBeenCalled();
	});

	it("alvo super_admin: revoke de permissions.manage é rejeitado (lock-out #184)", async () => {
		mockTargetRole("super_admin");

		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "permissions.manage",
			state: "revoke",
		});

		expect(r.ok).toBe(false);
		expect(dbInsert).not.toHaveBeenCalled();
		expect(dbDelete).not.toHaveBeenCalled();
	});

	it("alvo super_admin: revoke de cap arbitrária também é rejeitado (classe geral)", async () => {
		mockTargetRole("super_admin");

		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "branches.manage",
			state: "revoke",
		});

		expect(r.ok).toBe(false);
		expect(dbInsert).not.toHaveBeenCalled();
	});

	it("alvo super_admin: inherit é permitido (limpeza idempotente)", async () => {
		vi.mocked(requireCapabilityWithContext).mockResolvedValue(actorSuperAdmin);
		mockTargetRole("super_admin");
		mockTargetBranches([]);
		mockExistingOverride("revoke");
		const where = vi.fn(() => Promise.resolve());
		dbDelete.mockReturnValue({ where });

		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "permissions.manage",
			state: "inherit",
		});

		expect(r.ok).toBe(true);
		expect(dbDelete).toHaveBeenCalled();
		// inherit sobre super_admin nunca insere override — só limpa (issue #184).
		expect(dbInsert).not.toHaveBeenCalled();
	});
});
