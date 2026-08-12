import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbUpdate, mockLogActivity, mockSet, mockWhere } = vi.hoisted(() => {
	const mockWhere = vi.fn().mockResolvedValue(undefined);
	const mockSet = vi.fn(() => ({ where: mockWhere }));
	return {
		mockDbUpdate: vi.fn(() => ({ set: mockSet })),
		mockLogActivity: vi.fn().mockResolvedValue(undefined),
		mockSet,
		mockWhere,
	};
});

vi.mock("@emach/db", () => ({
	db: { update: mockDbUpdate, select: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	}),
}));

vi.mock("@/lib/activity", () => ({ logUserActivity: mockLogActivity }));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("../data", () => ({
	fetchToolDeletionFacts: vi.fn(),
	fetchToolsPage: vi.fn(),
	currentPrimaryCategoryId: vi.fn(),
	fetchDefinitionsBySlug: vi.fn(),
	primaryCategoryIncompleteError: vi.fn(),
}));

vi.mock("../_components/image-actions", () => ({
	deleteToolImage: vi.fn(),
	uploadToolImage: vi.fn(),
}));

vi.mock("../_components/video-actions", () => ({
	deleteToolVideoObject: vi.fn(),
}));

import { archiveTool } from "../actions";

beforeEach(() => {
	vi.clearAllMocks();
	mockWhere.mockResolvedValue(undefined);
});

describe("archiveTool", () => {
	it("marca discontinued e tira do site", async () => {
		const result = await archiveTool("tool-1");

		expect(result.ok).toBe(true);
		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "discontinued",
				visibleOnSite: false,
			})
		);
	});

	it("audita a ação", async () => {
		await archiveTool("tool-1");

		expect(mockLogActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "tool.archived",
				actorUserId: "actor-1",
				targetId: "tool-1",
				targetType: "tool",
			})
		);
	});

	it("devolve erro amigável quando o banco falha", async () => {
		mockWhere.mockRejectedValueOnce(new Error("boom"));

		const result = await archiveTool("tool-1");

		expect(result.ok).toBe(false);
	});
});
