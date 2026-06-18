import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — defined before vi.mock calls
// ---------------------------------------------------------------------------

const { mockTransaction, mockRequireCapabilityWithContext } = vi.hoisted(
	() => ({
		mockTransaction: vi.fn(),
		mockRequireCapabilityWithContext: vi.fn(),
	})
);

// Mock @emach/db — only needs db.transaction for assignBranch
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions — requireCapabilityWithContext is the key gate
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({ user: { id: "usr_1" } }),
	requireCapabilityWithContext: mockRequireCapabilityWithContext,
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/branch-scope — used inside lockOrderAndAuthorize for triage orders
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));

// Mock next/cache — avoid errors outside Next.js runtime
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Mock logger — avoid console noise
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock data modules that depend on @emach/db connection
vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
}));

vi.mock("../pending-data", () => ({
	fetchOrderActivityPage: vi.fn(),
	fetchPendingOrdersPage: vi.fn(),
}));

// Mock @/lib/session — used transitively by @emach/auth/dashboard
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { assignBranch } from "../actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const SOURCE_BRANCH_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const USER_ID = "usr_42";

/**
 * Build a `mockTx` that mimics the Drizzle transaction object.
 *
 * selectResults: array of arrays, each representing one select call's resolved
 * rows. The first call is the FOR UPDATE select inside lockOrderAndAuthorize;
 * the second call is the branch-name select inside assignBranch.
 */
function makeMockTx(selectResults: unknown[][]) {
	let selectCallIdx = 0;

	const insertValues = vi.fn().mockResolvedValue(undefined);

	// Build a chainable select: supports .from().where().for().limit() and
	// .from().where().limit() (no .for()).
	const makeSelectChain = (result: unknown[]) => {
		const chain: Record<string, unknown> = {};
		chain.from = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.for = vi.fn(() => chain);
		chain.limit = vi.fn(() => Promise.resolve(result));
		return chain;
	};

	// Build a chainable update: .set().where() resolves.
	const makeUpdateChain = () => {
		const chain: Record<string, unknown> = {};
		chain.set = vi.fn(() => chain);
		chain.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return chain;
	};

	// Build a chainable insert: .values() resolves.
	const makeInsertChain = () => ({
		values: insertValues,
	});

	return {
		select: vi.fn((_shape: unknown) => {
			const result = selectResults[selectCallIdx++] ?? [];
			return makeSelectChain(result);
		}),
		update: vi.fn((_table: unknown) => makeUpdateChain()),
		insert: vi.fn((_table: unknown) => makeInsertChain()),
		// exposed for assertions
		_insertValues: insertValues,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assignBranch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: requireCapabilityWithContext resolves with a session
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID },
		});
		// Default transaction impl (overridden per test as needed)
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ status: "pending_payment", branchId: SOURCE_BRANCH_ID }],
						[{ name: "Filial Destino" }],
					])
				)
		);
	});

	// -------------------------------------------------------------------------
	// (a) orderId inexistente → lockOrderAndAuthorize returns null → throw
	// -------------------------------------------------------------------------
	it("(a) orderId inexistente → retorna { ok: false, error: 'Pedido não encontrado' }", async () => {
		// tx.select returns [] — lockOrderAndAuthorize receives no locked row → returns null
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[], []]))
		);

		const result = await assignBranch({
			orderId: ORDER_ID,
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({ ok: false, error: "Pedido não encontrado" });
	});

	// -------------------------------------------------------------------------
	// (b) ator sem escopo na filial atual → Forbidden thrown by first
	// requireCapabilityWithContext call (inside lockOrderAndAuthorize)
	// -------------------------------------------------------------------------
	it("(b) sem escopo na filial atual → retorna { ok: false, error: 'Sem permissão ...' }", async () => {
		// Order row exists so lockOrderAndAuthorize proceeds, but cap check fails
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ status: "pending_payment", branchId: SOURCE_BRANCH_ID }],
						[],
					])
				)
		);
		// First call (inside lockOrderAndAuthorize) throws Forbidden
		mockRequireCapabilityWithContext.mockRejectedValueOnce(
			new Error("Forbidden: sem acesso à filial branch-src")
		);

		const result = await assignBranch({
			orderId: ORDER_ID,
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: false,
			error: "Sem permissão para alterar este pedido.",
		});
	});

	// -------------------------------------------------------------------------
	// (c) sucesso → ok: true, orderEvent gravado com actorUserId correto
	// -------------------------------------------------------------------------
	it("(c) sucesso → retorna { ok: true } e grava actorUserId = session.user.id", async () => {
		// Use an array so TS CFA doesn't narrow the captured value to `null`
		const captured: Record<string, unknown>[] = [];

		mockTransaction.mockImplementation(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
				const mockTx = makeMockTx([
					[{ status: "pending_payment", branchId: SOURCE_BRANCH_ID }],
					[{ name: "Filial Destino" }],
				]);
				// Capture insert values for assertion
				mockTx._insertValues.mockImplementation(
					(vals: Record<string, unknown>) => {
						captured.push(vals);
						return Promise.resolve(undefined);
					}
				);
				return cb(mockTx);
			}
		);

		// Both calls succeed with the session
		mockRequireCapabilityWithContext
			.mockResolvedValueOnce({ user: { id: USER_ID } }) // inside lockOrderAndAuthorize
			.mockResolvedValueOnce({ user: { id: USER_ID } }); // destination branch check

		const result = await assignBranch({
			orderId: ORDER_ID,
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({ ok: true, data: undefined });

		// insertOrderEvent must have been called exactly once
		expect(captured).toHaveLength(1);
		const insertedRow = captured[0];
		// actorUserId must be the session user id — not null (BUG-02 fix)
		expect(insertedRow?.actorUserId).toBe(USER_ID);
		// insertOrderEvent derives actorType from actorUserId: non-null → "user"
		expect(insertedRow?.actorType).toBe("user");
	});
});
