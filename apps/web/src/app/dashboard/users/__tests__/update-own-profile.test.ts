import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ requireCurrentSession: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// actions.ts também importa @emach/auth/dashboard (usado por outras actions do
// mesmo arquivo) — sem este mock, o load real de dashboard.ts chama createDb()
// e quebra por falta de env. Ver apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts.
vi.mock("@emach/auth/dashboard", () => ({
	authDashboard: { $context: Promise.resolve({}) },
}));

// vi.hoisted: vi.mock é hoisted acima dos top-level const, então a factory
// não pode fechar sobre um const declarado depois — ver apps/web/__tests__/activity.test.ts.
const { setName } = vi.hoisted(() => ({
	setName: vi.fn().mockReturnValue({ where: vi.fn() }),
}));
vi.mock("@emach/db", () => ({
	db: { update: vi.fn().mockReturnValue({ set: setName }) },
}));

import { requireCurrentSession } from "@/lib/session";
import { updateOwnProfile } from "../actions";

const session = (over = {}) => ({
	user: { id: "u1", status: "active", ...over },
});

describe("updateOwnProfile", () => {
	it("bloqueia conta não ativa", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(
			session({ status: "suspended" }) as never
		);
		const r = await updateOwnProfile({ name: "Novo" });
		expect(r.ok).toBe(false);
	});

	it("atualiza só o próprio nome", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({ name: "Novo Nome" });
		expect(r.ok).toBe(true);
		expect(setName).toHaveBeenCalledWith({ name: "Novo Nome" });
	});
});
