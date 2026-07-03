import { user as userTable } from "@emach/db/schema/auth";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ requireCurrentSession: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@emach/auth/dashboard", () => ({
	authDashboard: { $context: Promise.resolve({}) },
}));

// Spia `eq` mantendo o comportamento real — permite assertar o self-scope
// (`.where(eq(userTable.id, session.user.id))`) sem reconstruir o SQL.
vi.mock("drizzle-orm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("drizzle-orm")>();
	return { ...actual, eq: vi.fn(actual.eq) };
});

// Cleanup de avatar: `updateOwnProfile` lê o image atual e remove o antigo.
vi.mock("@/lib/storage", () => ({
	removeStorageObject: vi.fn(),
	extractPublicUrlPath: vi.fn((url: string) => url.split("/").pop() ?? null),
	uploadToPublicBucket: vi.fn(),
}));

const { setSpy, whereSpy } = vi.hoisted(() => {
	const whereSpy = vi.fn();
	return { setSpy: vi.fn().mockReturnValue({ where: whereSpy }), whereSpy };
});
// `db.select(...).from(...).where(...).limit(...)` → [{ image }]; `db.update(...).set(...).where(...)`.
const { currentImage } = vi.hoisted(() => ({
	currentImage: { v: null as string | null },
}));
vi.mock("@emach/db", () => ({
	db: {
		update: vi.fn().mockReturnValue({ set: setSpy }),
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					// mockImplementation (não mockResolvedValue): precisa ler
					// `currentImage.v` no momento da chamada, não no momento em
					// que o mock é criado — cada teste muda `currentImage.v`
					// depois que este factory já rodou.
					limit: vi
						.fn()
						.mockImplementation(() =>
							Promise.resolve([{ image: currentImage.v }])
						),
				}),
			}),
		}),
	},
}));

import { logUserActivity } from "@/lib/activity";
import { requireCurrentSession } from "@/lib/session";
import { removeStorageObject } from "@/lib/storage";
import { updateOwnProfile } from "../actions";

const session = (over = {}) => ({
	user: { id: "u1", status: "active", ...over },
});

describe("updateOwnProfile", () => {
	// O brief não zera os spies entre testes (sem `clearMocks` no
	// vitest.config.ts) — sem isto, `removeStorageObject` carrega chamadas
	// do teste anterior e o `.not.toHaveBeenCalled()` do último teste falsea.
	// `clearAllMocks` só limpa histórico de chamadas, não os
	// `mockReturnValue`/`mockImplementation` já configurados acima.
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("bloqueia conta não ativa", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(
			session({ status: "suspended" }) as never
		);
		const r = await updateOwnProfile({ name: "Novo" });
		expect(r.ok).toBe(false);
	});

	it("atualiza só o próprio nome (self-scope) e audita", async () => {
		currentImage.v = null;
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({ name: "Novo Nome" });
		expect(r.ok).toBe(true);
		expect(setSpy).toHaveBeenCalledWith({ name: "Novo Nome" });
		// self-scope: o WHERE do UPDATE mira o próprio id.
		expect(eq).toHaveBeenCalledWith(userTable.id, "u1");
		expect(whereSpy).toHaveBeenCalled();
		// auditoria: log com actorUserId = self e action correta.
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				actorUserId: "u1",
				action: "user.self_updated",
				targetId: "u1",
			})
		);
		// sem troca de foto → nenhum cleanup de storage.
		expect(removeStorageObject).not.toHaveBeenCalled();
	});

	it("remove o avatar antigo quando a foto muda", async () => {
		currentImage.v =
			"https://x.supabase.co/storage/v1/object/public/user-avatars/old.png";
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({
			image:
				"https://x.supabase.co/storage/v1/object/public/user-avatars/new.png",
		});
		expect(r.ok).toBe(true);
		expect(removeStorageObject).toHaveBeenCalledWith("user-avatars", "old.png");
	});

	it("não remove nada quando a foto é a mesma", async () => {
		const same =
			"https://x.supabase.co/storage/v1/object/public/user-avatars/same.png";
		currentImage.v = same;
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		await updateOwnProfile({ image: same });
		expect(removeStorageObject).not.toHaveBeenCalled();
	});
});
