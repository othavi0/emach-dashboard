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
	requireCapability: vi
		.fn()
		.mockResolvedValue({ user: { id: "usr_1", role: "admin" } }),
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

import { getTableName, type Table } from "drizzle-orm";
import { updateOrderStatus } from "../actions";

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";

interface LockedRow {
	branchId: string | null;
	couponId: string | null;
	status: string;
}

interface SelectChain {
	for: () => SelectChain;
	from: () => SelectChain;
	limit: () => Promise<unknown[]>;
	orderBy: () => Promise<unknown[]>;
	where: () => SelectChain;
}

interface UpdateChain {
	set: () => UpdateChain;
	where: () => Promise<{ rowCount: number }>;
}

/** Tabelas recebidas por tx.update, em ordem. */
const updatedTables: string[] = [];

/** `lockedRow` é a linha que o lockOrderAndAuthorize lê sob o FOR UPDATE. */
function makeMockTx(lockedRow: LockedRow) {
	const selectChain: SelectChain = {
		from: vi.fn(() => selectChain),
		where: vi.fn(() => selectChain),
		for: vi.fn(() => selectChain),
		limit: vi.fn(() => Promise.resolve([lockedRow])),
		// Itens do pedido lidos pelo débito de paid: o cupom não depende deles.
		orderBy: vi.fn(() => Promise.resolve([])),
	};

	const updateChain: UpdateChain = {
		set: vi.fn(() => updateChain),
		where: vi.fn(() => Promise.resolve({ rowCount: 1 })),
	};

	return {
		select: vi.fn(() => selectChain),
		update: vi.fn((table: Table) => {
			updatedTables.push(getTableName(table));

			return updateChain;
		}),
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
	};
}

type MockTx = ReturnType<typeof makeMockTx>;

function lockOrder(lockedRow: LockedRow) {
	mockTransaction.mockImplementation(
		async <T>(cb: (tx: MockTx) => Promise<T>): Promise<T> =>
			cb(makeMockTx(lockedRow))
	);
}

describe("updateOrderStatus — devolução da redenção do cupom", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updatedTables.length = 0;
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: "usr_42", role: "admin" },
		});
	});

	it("cancelar pedido com cupom devolve uma redenção na mesma transação", async () => {
		lockOrder({
			status: "pending_payment",
			branchId: BRANCH_ID,
			couponId: "promo-1",
		});

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "canceled",
			reason: "cliente desistiu",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(updatedTables).toEqual(["order", "promotion"]);
	});

	it("cancelar pedido sem cupom não toca a promotion", async () => {
		lockOrder({
			status: "payment_failed",
			branchId: BRANCH_ID,
			couponId: null,
		});

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "canceled",
			reason: "pagamento recusado",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(updatedTables).toEqual(["order"]);
	});

	it("marcar como pago não devolve a redenção", async () => {
		lockOrder({
			status: "pending_payment",
			branchId: BRANCH_ID,
			couponId: "promo-1",
		});

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "paid",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(updatedTables).toEqual(["order"]);
	});

	it("reembolsar pedido pago não devolve a redenção", async () => {
		lockOrder({ status: "paid", branchId: BRANCH_ID, couponId: "promo-1" });

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "refunded",
			reason: "produto em falta",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(updatedTables).toEqual(["order"]);
	});
});
