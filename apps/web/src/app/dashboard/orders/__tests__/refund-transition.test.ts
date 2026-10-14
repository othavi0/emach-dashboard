import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockRequireCapabilityWithContext } = vi.hoisted(
	() => ({
		mockTransaction: vi.fn(),
		mockRequireCapabilityWithContext: vi.fn(),
	})
);

vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: mockRequireCapabilityWithContext,
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
	ORDERS_COUNTS_TAG: "orders-counts",
}));

vi.mock("../pending-data", () => ({
	fetchOrderActivityPage: vi.fn(),
	fetchPendingOrdersPage: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

vi.mock("../../separacao/data", () => ({
	getLatestPicking: vi.fn(),
	getPickingForOrder: vi.fn(),
	fetchPickingQueue: vi.fn(),
	getOrderBranchId: vi.fn(),
}));

import { approveRefund } from "../actions";

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const REFUND_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function makeMockTx(refundStatus: string) {
	const refundRows = [{ orderId: ORDER_ID, status: refundStatus }];
	const lockedRows = [{ status: "delivered", branchId: BRANCH_ID }];

	const refundChain = {
		from: vi.fn(() => refundChain),
		where: vi.fn(() => Promise.resolve(refundRows)),
	};

	const lockChain = {
		from: vi.fn(() => lockChain),
		where: vi.fn(() => lockChain),
		for: vi.fn(() => lockChain),
		limit: vi.fn(() => Promise.resolve(lockedRows)),
	};

	const selects = [refundChain, lockChain];
	let selectCallIdx = 0;

	return {
		select: vi.fn(() => selects[selectCallIdx++]),
		update: vi.fn(),
	};
}

describe("approveRefund com status que não aceita a transição", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: "usr_42", role: "admin" },
		});
	});

	it("mostra os status com rótulo, não o valor do banco", async () => {
		mockTransaction.mockImplementation(
			async <T>(cb: (tx: ReturnType<typeof makeMockTx>) => Promise<T>) =>
				cb(makeMockTx("refunded"))
		);

		expect(await approveRefund(REFUND_ID)).toEqual({
			ok: false,
			error: "Transição de reembolso inválida: Reembolsado → Aprovado",
		});
	});
});
