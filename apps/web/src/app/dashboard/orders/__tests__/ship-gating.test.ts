import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — defined before vi.mock calls
// ---------------------------------------------------------------------------

const {
	mockTransaction,
	mockRequireCapabilityWithContext,
	mockGetLatestPicking,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
	mockGetLatestPicking: vi.fn(),
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

// Gate under test: getLatestPicking from separacao/data
vi.mock("../../separacao/data", () => ({
	getLatestPicking: mockGetLatestPicking,
	getPickingForOrder: vi.fn(),
	fetchPickingQueue: vi.fn(),
	getOrderBranchId: vi.fn(),
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
/** Regex that matches the picking exception gate error message. */
const EXCECAO_RE = /exceç/i;
/** Regex that matches the forceReason validation error message. */
const MOTIVO_RE = /motivo/i;
/** Regex that matches the in-progress forceShip block message. */
const ANDAMENTO_RE = /andamento/i;

/** Locked row for a "preparing" order with a branch. */
const LOCKED_ROW = { status: "preparing", branchId: BRANCH_ID };

/** Factory for the latest picking session, keyed by status. */
function latestWith(
	status: "in_progress" | "completed" | "exception" | "canceled"
) {
	return {
		pickingId: "pk_1",
		status,
		pickerUserId: "usr_9",
		pickerName: "João",
		startedAt: new Date(),
		completedAt: null,
		exceptionReason: status === "exception" ? "faltou item" : null,
		pickedUnits: 0,
		totalUnits: 8,
		lastScannedAt: null,
	};
}

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

	it("(1) super_admin SEM separação concluída → bloqueado (bypass removido)", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "super_admin" },
		});
		mockGetLatestPicking.mockResolvedValue(null);
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(SEPARA_RE);
	});

	it("(2) última sessão canceled (havia completed antiga) → bloqueado", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "admin" },
		});
		mockGetLatestPicking.mockResolvedValue(latestWith("canceled"));
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});
		expect(result.ok).toBe(false);
	});

	it("(3) última sessão completed → passa o gate", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "user" },
		});
		mockGetLatestPicking.mockResolvedValue(latestWith("completed"));
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});
		expect(result.ok).toBe(true);
	});

	it("(4) exception → bloqueado com mensagem própria", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "admin" },
		});
		mockGetLatestPicking.mockResolvedValue(latestWith("exception"));
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
		});
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(EXCECAO_RE);
	});

	it("(5) forceShip por admin → recusado", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "admin" },
		});
		mockGetLatestPicking.mockResolvedValue(null);
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
			forceShip: true,
			forceReason: "cliente no balcão aguardando",
		});
		expect(result.ok).toBe(false);
	});

	it("(6) forceShip super_admin sem motivo → recusado pelo schema", async () => {
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
			forceShip: true,
		});
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(MOTIVO_RE);
	});

	it("(7) forceShip super_admin com motivo, sem sessão ativa → passa", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "super_admin" },
		});
		mockGetLatestPicking.mockResolvedValue(latestWith("canceled"));
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
			forceShip: true,
			forceReason: "cliente no balcão aguardando",
		});
		expect(result.ok).toBe(true);
	});

	it("(8) forceShip com sessão in_progress → bloqueado (não força por cima)", async () => {
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID, role: "super_admin" },
		});
		mockGetLatestPicking.mockResolvedValue(latestWith("in_progress"));
		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "shipped",
			trackingCode: "BR123456789BR",
			forceShip: true,
			forceReason: "cliente no balcão aguardando",
		});
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			ANDAMENTO_RE
		);
	});
});
