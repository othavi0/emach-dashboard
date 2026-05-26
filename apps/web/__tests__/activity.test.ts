import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, selectMock } = vi.hoisted(() => {
	const valuesMock = vi.fn().mockResolvedValue(undefined);
	const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

	const limitMock = vi.fn().mockResolvedValue([{ name: "Actor Name" }]);
	const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
	const fromMock = vi.fn().mockReturnValue({ where: whereMock });
	const selectMock = vi.fn().mockReturnValue({ from: fromMock });

	return { insertMock, selectMock };
});

vi.mock("@emach/db", () => ({
	db: { insert: insertMock, select: selectMock },
}));

vi.mock("@emach/db/schema/auth", () => ({
	user: { __table: "user" },
}));

vi.mock("@emach/db/schema/user-activity", () => ({
	userActivityLog: { __table: "user_activity_log" },
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn(),
}));

import { logUserActivity } from "@/lib/activity";

describe("logUserActivity", () => {
	beforeEach(() => {
		insertMock.mockReset();
		const valuesMock = vi.fn().mockResolvedValue(undefined);
		insertMock.mockReturnValue({ values: valuesMock });

		selectMock.mockReset();
		const limitMock = vi.fn().mockResolvedValue([{ name: "Actor Name" }]);
		const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
		const fromMock = vi.fn().mockReturnValue({ where: whereMock });
		selectMock.mockReturnValue({ from: fromMock });
	});

	it("insere row com actorUserId + action + metadata + actorName snapshot", async () => {
		await logUserActivity({
			actorUserId: "user-1",
			action: "user.approved",
			targetType: "user",
			targetId: "user-2",
			metadata: { reason: "ok" },
		});
		expect(insertMock).toHaveBeenCalledOnce();
		const values = insertMock.mock.results[0]?.value.values;
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				actorUserId: "user-1",
				action: "user.approved",
				targetType: "user",
				targetId: "user-2",
				metadata: { reason: "ok", actorName: "Actor Name" },
			})
		);
	});

	it("aceita chamada sem targetType / targetId / metadata — actorName ainda snapshoteado", async () => {
		await logUserActivity({
			actorUserId: "user-1",
			action: "system.healthcheck",
		});
		expect(insertMock).toHaveBeenCalledOnce();
		const values = insertMock.mock.results[0]?.value.values;
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				actorUserId: "user-1",
				action: "system.healthcheck",
				targetType: null,
				targetId: null,
				metadata: { actorName: "Actor Name" },
			})
		);
	});

	it("usa actorName: null quando actor não encontrado no DB", async () => {
		const limitMock = vi.fn().mockResolvedValue([]);
		const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
		const fromMock = vi.fn().mockReturnValue({ where: whereMock });
		selectMock.mockReturnValue({ from: fromMock });

		await logUserActivity({
			actorUserId: "ghost-user",
			action: "user.approved",
		});
		expect(insertMock).toHaveBeenCalledOnce();
		const values = insertMock.mock.results[0]?.value.values;
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: { actorName: null },
			})
		);
	});
});
