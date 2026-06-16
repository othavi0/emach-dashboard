import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/permissions", () => ({
	requireCapabilityWithContext: vi.fn(),
	getUserCapabilities: vi.fn(),
}));
vi.mock("@emach/db", () => ({
	db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));

import { db } from "@emach/db";
import { setSectionCapabilities } from "@/app/dashboard/users/[id]/permissions/actions";
import { logUserActivity } from "@/lib/activity";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const actorSuper = {
	user: { id: "actor", role: "super_admin", status: "active" },
} as never;

function mockTargetRole(role: string | null) {
	const limit = vi.fn(() => Promise.resolve(role ? [{ role }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
function mockTargetBranches(ids: string[]) {
	const where = vi.fn(() =>
		Promise.resolve(ids.map((branchId) => ({ branchId })))
	);
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

beforeEach(() => {
	vi.clearAllMocks();
	(requireCapabilityWithContext as ReturnType<typeof vi.fn>).mockResolvedValue(
		actorSuper
	);
	(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
		new Set(["tools.create", "tools.delete"])
	);
});

describe("setSectionCapabilities", () => {
	it("aplica revoke a várias caps + audita evento agregado", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
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

	it("alvo super_admin: revoke em massa é rejeitado (issue #184)", async () => {
		mockTargetRole("super_admin");
		const r = await setSectionCapabilities({
			targetUserId: "sa",
			capabilities: ["tools.create"],
			state: "revoke",
		});
		expect(r.ok).toBe(false);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("grant em massa pula caps que o ator não possui (anti-escalada)", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
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
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "foo.bar"],
			state: "revoke",
		});
		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(1);
	});
});
