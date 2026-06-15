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
import { setUserCapability } from "@/app/dashboard/users/[id]/permissions/actions";
import { logUserActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const actorAdmin = {
	user: { id: "actor-admin", role: "admin", status: "active" },
} as never;

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
		actorAdmin
	);
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
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetBranches(["b1"]);
		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.delete",
			state: "grant",
		});
		expect(r.ok).toBe(false);
	});

	it("grant válido: ator tem a cap e alvo no escopo → insere + audita", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "grant",
		});
		expect(r.ok).toBe(true);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.granted", targetId: "u1" })
		);
	});

	it("inherit: remove a linha de override", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetBranches(["b1"]);
		const where = vi.fn(() => Promise.resolve());
		(db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where });
		const r = await setUserCapability({
			targetUserId: "u1",
			capability: "tools.create",
			state: "inherit",
		});
		expect(r.ok).toBe(true);
		expect(db.delete).toHaveBeenCalled();
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.reset", targetId: "u1" })
		);
	});

	it("revoke válido: insere effect=revoke e audita permission.revoked", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
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
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetBranches(["b1"]);
		(db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
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
});
