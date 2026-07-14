import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { select: mockSelect },
	createDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	can: vi.fn(),
}));
vi.mock("@/lib/branch-scope", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/branch-scope")>();
	return {
		...actual,
		getUserBranchScope: vi.fn(),
	};
});

import { getUserBranchScope } from "@/lib/branch-scope";
import {
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import {
	fetchVariantBranchMovementsPage,
	getReservedQtyByVariantBranch,
	getStockMovements,
	getStockMovementsByVariantBranch,
} from "../movements-data";
import { fetchToolActivityPage, getToolActivity } from "../tool-activity-data";

const FORBIDDEN = new Error('Forbidden: capability "stock.read" requerida');
const SESSION = { user: { id: "usr_1", role: "user" } };

// Chain de select que resolve [] em qualquer terminal (where/limit/orderBy).
function makeSelectChain(result: unknown[] = []) {
	const chain: Record<string, unknown> = {
		// biome-ignore lint/suspicious/noThenProperty: thenable mock — permite await sem terminal explícito
		then: (resolve: (v: unknown) => void) => resolve(result),
	};
	for (const m of [
		"from",
		"innerJoin",
		"leftJoin",
		"where",
		"orderBy",
	] as const) {
		chain[m] = vi.fn(() => chain);
	}
	chain.limit = vi.fn(() => Promise.resolve(result));
	return chain;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockSelect.mockImplementation(() => makeSelectChain());
	vi.mocked(requireCapability).mockResolvedValue(
		SESSION as Awaited<ReturnType<typeof requireCapability>>
	);
	vi.mocked(requireCapabilityWithContext).mockResolvedValue(
		SESSION as Awaited<ReturnType<typeof requireCapabilityWithContext>>
	);
	vi.mocked(getUserBranchScope).mockResolvedValue({ kind: "all" });
});

describe("getStockMovements — guard + escopo", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getStockMovements("tool-id")).rejects.toThrow("stock.read");
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it("escopo cego (scoped sem filial) retorna vazio sem tocar o banco", async () => {
		vi.mocked(getUserBranchScope).mockResolvedValueOnce({
			kind: "scoped",
			branchIds: [],
			includeUnassigned: false,
		});
		await expect(getStockMovements("tool-id")).resolves.toEqual([]);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it("scoped com filial consulta o banco (filtro de escopo aplicado)", async () => {
		vi.mocked(getUserBranchScope).mockResolvedValueOnce({
			kind: "scoped",
			branchIds: ["br_1"],
			includeUnassigned: false,
		});
		await expect(getStockMovements("tool-id")).resolves.toEqual([]);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});
});

describe("getToolActivity — guard + escopo", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(getToolActivity("tool-id")).rejects.toThrow("stock.read");
	});

	it("escopo cego retorna vazio sem tocar o banco", async () => {
		vi.mocked(getUserBranchScope).mockResolvedValueOnce({
			kind: "scoped",
			branchIds: [],
			includeUnassigned: false,
		});
		await expect(getToolActivity("tool-id")).resolves.toEqual([]);
		expect(mockSelect).not.toHaveBeenCalled();
	});
});

describe("fetchToolActivityPage — validação de branchId vs escopo", () => {
	it("branchId fora do escopo retorna vazio sem tocar o banco", async () => {
		vi.mocked(getUserBranchScope).mockResolvedValueOnce({
			kind: "scoped",
			branchIds: ["br_minha"],
			includeUnassigned: false,
		});
		await expect(
			fetchToolActivityPage(
				{ branchId: "br_alheia", period: "30d", toolId: "tool-id" },
				null
			)
		).resolves.toEqual({ items: [], nextCursor: null });
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it("branchId dentro do escopo consulta o banco", async () => {
		vi.mocked(getUserBranchScope).mockResolvedValueOnce({
			kind: "scoped",
			branchIds: ["br_minha"],
			includeUnassigned: false,
		});
		await fetchToolActivityPage(
			{ branchId: "br_minha", period: "30d", toolId: "tool-id" },
			null
		);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});

	it("super_admin sem branchId consulta sem restrição de escopo", async () => {
		await fetchToolActivityPage({ period: "30d", toolId: "tool-id" }, null);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});
});

describe("data fns branch-targeted — capability com contexto de filial", () => {
	it("getStockMovementsByVariantBranch valida stock.read + branchId no escopo", async () => {
		await getStockMovementsByVariantBranch("variant-id", "branch-id");
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"stock.read",
			{ targetBranchIds: ["branch-id"] }
		);
	});

	it("fetchVariantBranchMovementsPage valida stock.read + branchId no escopo", async () => {
		await fetchVariantBranchMovementsPage("variant-id", "branch-id", null);
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"stock.read",
			{ targetBranchIds: ["branch-id"] }
		);
	});

	it("getReservedQtyByVariantBranch valida stock.read + branchId no escopo", async () => {
		await getReservedQtyByVariantBranch("variant-id", "branch-id");
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"stock.read",
			{ targetBranchIds: ["branch-id"] }
		);
	});

	it("Forbidden fora do escopo propaga sem tocar o banco", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("Forbidden: filial fora do escopo")
		);
		await expect(
			fetchVariantBranchMovementsPage("variant-id", "br_alheia", null)
		).rejects.toThrow("fora do escopo");
		expect(mockSelect).not.toHaveBeenCalled();
	});
});
