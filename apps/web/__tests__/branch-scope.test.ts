import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock sem tipo de propósito: o stub devolve só a cadeia from().where() que
// getUserBranchScope usa, não o builder inteiro do Drizzle.
const { dbSelect } = vi.hoisted(() => ({ dbSelect: vi.fn() }));

vi.mock("@emach/db", () => ({
	db: { select: dbSelect },
}));

vi.mock("@emach/db/schema/inventory", () => ({
	userBranch: { __table: "user_branch" },
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn(),
	sql: vi.fn(),
}));

import { makeSession } from "@/lib/__tests__/fixtures/make-session";
import {
	type BranchScope,
	getUserBranchScope,
	inScope,
	isBlindScope,
} from "@/lib/branch-scope";

// Helper: mocka a query SELECT branchId FROM user_branch WHERE userId = ?
function mockBranchRows(branchIds: string[]) {
	const where = vi.fn(() =>
		Promise.resolve(branchIds.map((branchId) => ({ branchId })))
	);

	const from = vi.fn(() => ({ where }));
	dbSelect.mockReturnValueOnce({ from });
}

// --- testes das funções puras (preservados) ---

const all: BranchScope = { kind: "all" };

const sp: BranchScope = {
	kind: "scoped",
	branchIds: ["b-sp"],
	includeUnassigned: true,
};

const userSp: BranchScope = {
	kind: "scoped",
	branchIds: ["b-sp"],
	includeUnassigned: false,
};

const blind: BranchScope = {
	kind: "scoped",
	branchIds: [],
	includeUnassigned: false,
};

describe("inScope", () => {
	it("all → sempre true", () => expect(inScope(all, "qualquer")).toBe(true));
	it("scoped → só filiais da lista", () => {
		expect(inScope(sp, "b-sp")).toBe(true);
		expect(inScope(sp, "b-rj")).toBe(false);
	});
});

describe("isBlindScope", () => {
	it("user sem filial → cego", () => expect(isBlindScope(blind)).toBe(true));
	it("admin sem filial mas com triagem → não cego", () =>
		expect(
			isBlindScope({ kind: "scoped", branchIds: [], includeUnassigned: true })
		).toBe(false));
	it("all → nunca cego", () => expect(isBlindScope(all)).toBe(false));
	it("user com filial → não cego", () =>
		expect(isBlindScope(userSp)).toBe(false));
});

// --- testes de getUserBranchScope (com DB mockado) ---

describe("getUserBranchScope — mapeamento role → escopo", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("super_admin → {kind:'all'} sem consultar o banco", async () => {
		const s = makeSession({
			id: "gs-sa-1",
			role: "super_admin",
			status: "active",
		});

		const scope = await getUserBranchScope(s);
		expect(scope.kind).toBe("all");
		expect(dbSelect).not.toHaveBeenCalled();
	});

	it("admin com filiais → scoped + includeUnassigned:true", async () => {
		const s = makeSession({
			id: "gs-admin-1",
			role: "admin",
			status: "active",
		});

		mockBranchRows(["b-sp", "b-rj"]);
		const scope = await getUserBranchScope(s);
		expect(scope.kind).toBe("scoped");

		if (scope.kind === "scoped") {
			expect(scope.branchIds).toEqual(["b-sp", "b-rj"]);
			expect(scope.includeUnassigned).toBe(true);
		}
	});

	it("user com filial → scoped + includeUnassigned:false", async () => {
		const s = makeSession({ id: "gs-user-1", role: "user", status: "active" });

		mockBranchRows(["b-sp"]);
		const scope = await getUserBranchScope(s);
		expect(scope.kind).toBe("scoped");

		if (scope.kind === "scoped") {
			expect(scope.branchIds).toEqual(["b-sp"]);
			expect(scope.includeUnassigned).toBe(false);
		}
	});

	it("user sem vínculo (fail-closed) → scoped com branchIds:[] + includeUnassigned:false", async () => {
		const s = makeSession({
			id: "gs-user-blind-1",
			role: "user",
			status: "active",
		});

		mockBranchRows([]);
		const scope = await getUserBranchScope(s);
		expect(scope.kind).toBe("scoped");

		if (scope.kind === "scoped") {
			expect(scope.branchIds).toEqual([]);
			expect(scope.includeUnassigned).toBe(false);
		}
	});
});
