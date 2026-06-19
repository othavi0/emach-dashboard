import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the mock factory so it runs before any import.
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("@emach/db", () => ({
	db: { execute: mockExecute },
}));

// Import after mocks are registered.
import { getCategoryAncestors } from "../data";

// React.cache() deduplication only works within a single render/request scope.
// In tests, each describe/it block runs without a React rendering context, so
// cache() behaves as a plain identity wrapper (calls the underlying fn every time).
// We test the output shape instead of dedup, and verify the query fires once per call.

describe("getCategoryAncestors", () => {
	beforeEach(() => {
		mockExecute.mockReset();
	});

	it("retorna ancestrais em ordem raiz-primeiro (depth asc)", async () => {
		mockExecute.mockResolvedValueOnce({
			rows: [
				{ id: "root-id", name: "Raiz", depth: 0 },
				{ id: "mid-id", name: "Meio", depth: 1 },
			],
		});

		const result = await getCategoryAncestors("leaf-id");

		expect(result).toEqual([
			{ id: "root-id", name: "Raiz" },
			{ id: "mid-id", name: "Meio" },
		]);
	});

	it("retorna array vazio quando a categoria não tem pai (raiz)", async () => {
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const result = await getCategoryAncestors("root-only-id");

		expect(result).toEqual([]);
	});

	it("mapeia apenas id e name (ignora depth do resultado)", async () => {
		mockExecute.mockResolvedValueOnce({
			rows: [{ id: "a", name: "A", depth: 0 }],
		});

		const result = await getCategoryAncestors("leaf-id");

		expect(result).toEqual([{ id: "a", name: "A" }]);
		// depth deve ser omitido do retorno
		expect(Object.keys(result[0] ?? {})).toEqual(["id", "name"]);
	});

	it("emite exatamente 1 query ao DB para qualquer profundidade de ancestral", async () => {
		mockExecute.mockResolvedValue({
			rows: [
				{ id: "a", name: "A", depth: 0 },
				{ id: "b", name: "B", depth: 1 },
				{ id: "c", name: "C", depth: 2 },
				{ id: "d", name: "D", depth: 3 },
			],
		});

		const result = await getCategoryAncestors("deep-leaf-id");

		// Single query regardless of depth — the old loop would have issued 4.
		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(4);
	});
});
