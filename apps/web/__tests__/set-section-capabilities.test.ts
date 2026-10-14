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

import { setSectionCapabilities } from "@/app/dashboard/users/[id]/permissions/actions";
import { makeSession } from "@/lib/__tests__/fixtures/make-session";
import { logUserActivity } from "@/lib/activity";
import type { Capability } from "@/lib/capabilities";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const actorSuper = makeSession({
	id: "actor",
	role: "super_admin",
	status: "active",
});

function mockTargetRole(role: string | null) {
	const limit = vi.fn(() => Promise.resolve(role ? [{ role }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

function mockTargetBranches(ids: string[]) {
	const where = vi.fn(() =>
		Promise.resolve(ids.map((branchId) => ({ branchId })))
	);

	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCapabilityWithContext).mockResolvedValue(actorSuper);
	vi.mocked(getUserCapabilities).mockResolvedValue(
		new Set<Capability>(["tools.create", "tools.delete"])
	);
});

describe("setSectionCapabilities", () => {
	it("aplica revoke a várias caps + audita evento agregado", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "tools.delete"],
			state: "revoke",
		});

		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(2);
		expect(logUserActivity).toHaveBeenCalledTimes(1);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ bulk: true, effect: "revoke" }),
			})
		);
	});

	it("inherit em massa: deleta os overrides (não insere) + audita", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const where = vi.fn(() => Promise.resolve());
		dbDelete.mockReturnValue({ where });

		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "tools.delete"],
			state: "inherit",
		});

		expect(r.ok).toBe(true);
		expect(dbDelete).toHaveBeenCalledTimes(2);
		expect(dbInsert).not.toHaveBeenCalled();
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ bulk: true, effect: "inherit" }),
			})
		);
	});

	it("alvo super_admin: revoke em massa é rejeitado (issue #184)", async () => {
		mockTargetRole("super_admin");

		const r = await setSectionCapabilities({
			targetUserId: "sa",
			capabilities: ["tools.create"],
			state: "revoke",
		});

		expect(r.ok).toBe(false);
		expect(dbInsert).not.toHaveBeenCalled();
	});

	it("grant em massa pula caps que o ator não possui (anti-escalada)", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "categories.delete"], // ator não tem categories.delete
			state: "grant",
		});

		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(1); // só tools.create
	});

	it("ignora caps fora do registry", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		dbInsert.mockReturnValue({ values });

		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "foo.bar"],
			state: "revoke",
		});

		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(1);
	});
});
