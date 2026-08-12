import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchFacts, mockDbDelete, mockDbSelect } = vi.hoisted(() => ({
	mockFetchFacts: vi.fn(),
	mockDbDelete: vi.fn(),
	mockDbSelect: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { delete: mockDbDelete, select: mockDbSelect },
}));

vi.mock("../data", () => ({
	fetchToolDeletionFacts: mockFetchFacts,
	fetchToolsPage: vi.fn(),
	currentPrimaryCategoryId: vi.fn(),
	fetchDefinitionsBySlug: vi.fn(),
	primaryCategoryIncompleteError: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "super_admin" },
	}),
}));

vi.mock("@/lib/activity", () => ({
	logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("../_components/image-actions", () => ({
	deleteToolImage: vi.fn().mockResolvedValue(undefined),
	uploadToolImage: vi.fn(),
}));

vi.mock("../_components/video-actions", () => ({
	deleteToolVideoObject: vi.fn().mockResolvedValue(undefined),
}));

import { deleteTool } from "../actions";

/** db.select(...).from(...).where(...) → linhas; usado p/ nome, imagens e vídeo. */
function setupSelect(rows: Record<string, unknown>[]) {
	mockDbSelect.mockReturnValue({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(rows),
				// biome-ignore lint/suspicious/noThenProperty: mock intencional do query builder thenable do Drizzle
				then: (resolve: (r: unknown) => unknown) => resolve(rows),
			}),
		}),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setupSelect([{ name: "Ferramenta de teste", url: null, poster: null }]);
	mockDbDelete.mockReturnValue({ where: () => Promise.resolve(undefined) });
});

describe("deleteTool", () => {
	it("bloqueia quando a ferramenta tem pedidos", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 4,
			reviewCount: 0,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("4 pedidos");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("bloqueia quando a ferramenta tem avaliações", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 1,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("avaliação");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("bloqueia quando ainda há estoque em filial", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 0,
			stockBranchCount: 1,
			stockQty: 90,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("90 un");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("exclui quando não há pedido, avaliação nem estoque", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 0,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(true);
		expect(mockDbDelete).toHaveBeenCalled();
	});
});
