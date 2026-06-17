import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before vi.mock factories
// ---------------------------------------------------------------------------

const { mockTransaction } = vi.hoisted(() => {
	// db.transaction executes the callback with a tx mock
	const mockTransaction = vi.fn();

	return { mockTransaction };
});

// ---------------------------------------------------------------------------
// vi.mock declarations — hoisted by Vitest before any import
// ---------------------------------------------------------------------------

vi.mock("@emach/env/server", () => ({
	env: { BETTER_AUTH_URL: "http://localhost:3000", INVITE_JWT_SECRET: "x" },
}));

vi.mock("@emach/db", () => ({
	db: {
		transaction: mockTransaction,
	},
}));

vi.mock("@emach/auth/dashboard", () => ({
	authDashboard: {
		$context: Promise.resolve({
			internalAdapter: { createUser: vi.fn() },
		}),
	},
}));

vi.mock("@emach/email/send", () => ({
	sendInviteEmail: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapabilityWithContext: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	}),
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	}),
	can: vi.fn().mockResolvedValue(true),
	roleHasCapability: vi.fn().mockReturnValue(true),
	getUserCapabilities: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/activity", () => ({
	logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
	headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn().mockResolvedValue({
		user: { id: "actor-1", role: "admin" },
	}),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { unlinkUserFromBranch } from "../actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validInput = {
	userId: "user-1",
	branchId: "branch-1",
};

/**
 * Build a tx mock that simulates the query chain inside db.transaction.
 * selectUserResult: array returned by tx.select().from().where().limit(1)
 * lockedBranches: array returned by tx.select().from().where().for("update")
 *
 * Both selects share the same where() chain but the action uses:
 * - .limit(1) for the user role lookup
 * - .for("update") for the branch lock
 */
function makeTxMock(
	selectUserResult: Array<{ role: string }>,
	lockedBranches: Array<{ branchId: string }>
) {
	const tx = {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(selectUserResult),
					for: vi.fn().mockResolvedValue(lockedBranches),
				}),
			}),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue({ rowCount: 1 }),
		}),
	};

	return tx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("unlinkUserFromBranch — last-branch guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default: transaction pass-through (runs callback with tx mock)
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeTxMock>) => Promise<unknown>) => {
				const tx = makeTxMock(
					[{ role: "admin" }],
					[{ branchId: "branch-1" }, { branchId: "branch-2" }]
				);
				return await cb(tx);
			}
		);
	});

	it("rejeita quando admin tem exatamente 1 filial", async () => {
		// Only 1 branch in locked array (the target branch itself)
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeTxMock>) => Promise<unknown>) => {
				const tx = makeTxMock(
					[{ role: "admin" }],
					[{ branchId: "branch-1" }] // only 1 branch = the one being removed
				);
				return await cb(tx);
			}
		);

		const result = await unlinkUserFromBranch(validInput);

		expect(result).toEqual({
			ok: false,
			error: "Usuário precisa de ao menos 1 filial",
		});
	});

	it("permite quando admin tem 2 filiais e remove uma", async () => {
		// 2 branches in locked array; after filtering branch-1, still has branch-2
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeTxMock>) => Promise<unknown>) => {
				const tx = makeTxMock(
					[{ role: "admin" }],
					[{ branchId: "branch-1" }, { branchId: "branch-2" }]
				);
				return await cb(tx);
			}
		);

		const result = await unlinkUserFromBranch(validInput);

		expect(result).toEqual({ ok: true, data: undefined });
	});

	it("permite quando super_admin tem apenas 1 filial (guard não se aplica)", async () => {
		// super_admin bypasses the last-branch guard entirely
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeTxMock>) => Promise<unknown>) => {
				const tx = makeTxMock(
					[{ role: "super_admin" }],
					[{ branchId: "branch-1" }] // only 1 branch, but guard doesn't apply
				);
				return await cb(tx);
			}
		);

		const result = await unlinkUserFromBranch(validInput);

		expect(result).toEqual({ ok: true, data: undefined });
	});

	it("retorna erro quando usuário não é encontrado", async () => {
		// userTable select returns empty array
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeTxMock>) => Promise<unknown>) => {
				const tx = makeTxMock(
					[], // no user found
					[]
				);
				return await cb(tx);
			}
		);

		const result = await unlinkUserFromBranch(validInput);

		expect(result).toEqual({
			ok: false,
			error: "Usuário não encontrado",
		});
	});
});
