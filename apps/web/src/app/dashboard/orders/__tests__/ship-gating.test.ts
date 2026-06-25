import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — defined before vi.mock calls
// ---------------------------------------------------------------------------

const {
	mockTransaction,
	mockRequireCapabilityWithContext,
	mockHasCompletedPicking,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
	mockHasCompletedPicking: vi.fn(),
}));

// Mock @emach/db
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi
		.fn()
		.mockResolvedValue({ user: { id: "usr_1", role: "admin" } }),
	requireCapabilityWithContext: mockRequireCapabilityWithContext,
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/branch-scope
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock data modules
vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
	ORDERS_COUNTS_TAG: "orders-counts",
}));

vi.mock("../pending-data", () => ({
	fetchOrderActivityPage: vi.fn(),
	fetchPendingOrdersPage: vi.fn(),
}));

// Mock @/lib/session
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

// Gate under test: hasCompletedPicking from separacao/data
vi.mock("../../separacao/data", () => ({
	hasCompletedPicking: mockHasCompletedPicking,
	getPickingForOrder: vi.fn(),
	fetchPickingQueue: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { updateOrderStatus } from "../actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "usr_42";

/**
 * Build a mockTx that mimics the Drizzle transaction object.
 * selectResults[0] = the FOR UPDATE row from lockOrderAndAuthorize.
 */
function makeMockTx(selectResults: unknown[][]) {
	let selectCallIdx = 0;

	const makeSelectChain = (result: unknown[]) => {
		const chain: Record<string, unknown> = {};
		chain.from = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.for = vi.fn(() => chain);
		chain.limit = vi.fn(() => Promise.resolve(result));
		return chain;
	};

	const makeUpdateChain = () => {
		const chain: Record<string, unknown> = {};
		chain.set = vi.fn(() => chain);
		chain.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return chain;
	};

	const makeInsertChain = () => ({
		values: vi.fn().mockResolvedValue(undefined),
	});

	return {
		select: vi.fn((_shape: unknown) => {
			const result = selectResults[selectCallIdx++] ?? [];
			return makeSelectChain(result);
		}),
		update: vi.fn((_table: unknown) => makeUpdateChain()),
		insert: vi.fn((_table: unknown) => makeInsertChain()),
	};
}

/** Regex that matches the picking gate error message. */
const SEPARA_RE = /separa/i;

/** Locked row for a "preparing" order with a branch. */
const LOCKED_ROW = { status: "preparing", branchId: BRANCH_ID };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateOrderStatus — ship gating (separação)", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default: transaction runs the callback
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[LOCKED_ROW]]))
		);
	});

	// -----------------------------------------------------------------------
	// 1. Blocked: role user/admin, no completed picking
	// -----------------------------------------------------------------------
	it("(1a) role=admin, sem separação concluída → ok: false, erro menciona 'separação'", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "admin" },
		});
		mockHasCompletedPicking.mockResolvedValue(false);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});

		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(SEPARA_RE);
	});

	it("(1b) role=user, sem separação concluída → ok: false, erro menciona 'separação'", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "user" },
		});
		mockHasCompletedPicking.mockResolvedValue(false);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});

		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(SEPARA_RE);
	});

	// -----------------------------------------------------------------------
	// 2. Passes: picking completed (any role)
	// -----------------------------------------------------------------------
	it("(2) role=admin, separação concluída → não bloqueia pelo gate de picking", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "admin" },
		});
		mockHasCompletedPicking.mockResolvedValue(true);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});

		// ok: true OR a different error (not "separação"), meaning the gate didn't block it
		if (result.ok) {
			expect(result.ok).toBe(true);
		} else {
			expect((result as { ok: false; error: string }).error).not.toMatch(
				SEPARA_RE
			);
		}
	});

	// -----------------------------------------------------------------------
	// 3. super_admin bypass: skips picking check even without completed picking
	// -----------------------------------------------------------------------
	it("(3) role=super_admin, sem separação concluída → gate ignorado (não bloqueia)", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "super_admin" },
		});
		mockHasCompletedPicking.mockResolvedValue(false);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});

		// Must NOT be blocked by the picking gate
		if (result.ok) {
			expect(result.ok).toBe(true);
		} else {
			expect((result as { ok: false; error: string }).error).not.toMatch(
				SEPARA_RE
			);
		}
	});
});
