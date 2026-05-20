import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock } = vi.hoisted(() => {
	const insertMock = vi.fn().mockReturnValue({
		values: vi.fn().mockResolvedValue(undefined),
	});
	return { insertMock };
});

vi.mock("@emach/db", () => ({
	db: { insert: insertMock },
}));

vi.mock("@emach/db/schema/user-activity", () => ({
	userActivityLog: { __table: "user_activity_log" },
}));

import { logUserActivity } from "@/lib/activity";

describe("logUserActivity", () => {
	beforeEach(() => {
		insertMock.mockReset();
		insertMock.mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("insere row com actorUserId + action + metadata", async () => {
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
				metadata: { reason: "ok" },
			})
		);
	});

	it("aceita chamada sem targetType / targetId / metadata", async () => {
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
				metadata: null,
			})
		);
	});
});
