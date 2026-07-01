import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — defined before vi.mock calls
// ---------------------------------------------------------------------------

const { mockTransaction, mockRequireCapability } = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockRequireCapability: vi.fn(),
}));

// Mock @emach/db — only needs db.transaction for actions
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions
vi.mock("@/lib/permissions", () => ({
	requireCapability: mockRequireCapability,
	requireCapabilityWithContext: vi
		.fn()
		.mockResolvedValue({ user: { id: "usr_1", name: "Picker" } }),
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/branch-scope
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
	orderBranchCondition: vi.fn().mockReturnValue(undefined),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
	unstable_cache: vi.fn((fn: unknown) => fn),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock data modules
vi.mock("../data", () => ({
	fetchPickingQueuePage: vi.fn(),
	getActivePickingForUser: vi.fn(),
	getPickingForOrder: vi.fn(),
}));

// Mock @/lib/session
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
	cancelPicking,
	completePicking,
	reportMissing,
	scanItem,
	startPicking,
} from "../actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const PICKING_ID = "550e8400-e29b-41d4-a716-446655440000";
const PICKING_ITEM_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const BRANCH_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const USER_ID = "usr_42";
const USER_NAME = "Operador Teste";

const mockSession = {
	user: { id: USER_ID, name: USER_NAME, role: "user", status: "active" },
};

/**
 * Build a mock Drizzle transaction object.
 * selectResults: each inner array is one select call's resolved rows.
 */
function makeMockTx(selectResults: unknown[][]) {
	let selectCallIdx = 0;
	const insertValues = vi.fn().mockResolvedValue(undefined);

	const makeSelectChain = (result: unknown[]) => {
		// Make the chain thenable so `await tx.select().from(t).where(...)` works
		// both with and without a terminal .limit() call.
		const chain: Record<string, unknown> = {
			// biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Drizzle query builder
			then: (resolve: (v: unknown) => void) => resolve(result),
			catch: () => chain,
			finally: (fn: () => void) => {
				fn();
				return chain;
			},
		};
		chain.from = vi.fn(() => chain);
		chain.leftJoin = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.for = vi.fn(() => chain);
		chain.limit = vi.fn(() => Promise.resolve(result));
		chain.orderBy = vi.fn(() => chain);
		return chain;
	};

	const makeUpdateChain = () => {
		const chain: Record<string, unknown> = {};
		chain.set = vi.fn(() => chain);
		chain.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return chain;
	};

	const makeInsertChain = () => ({ values: insertValues });

	return {
		select: vi.fn((_shape: unknown) => {
			const result = selectResults[selectCallIdx++] ?? [];
			return makeSelectChain(result);
		}),
		update: vi.fn((_table: unknown) => makeUpdateChain()),
		insert: vi.fn((_table: unknown) => makeInsertChain()),
		_insertValues: insertValues,
	};
}

// ---------------------------------------------------------------------------
// Tests: startPicking
// ---------------------------------------------------------------------------

describe("startPicking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("rejeita status inválido (pending_payment)", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[{ status: "pending_payment", branchId: BRANCH_ID }]]))
		);

		const result = await startPicking(ORDER_ID);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain("status");
	});

	it("rejeita quando branchId é null", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[{ status: "paid", branchId: null }]]))
		);

		const result = await startPicking(ORDER_ID);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain("filial");
	});

	it("retorna { ok: false } quando pedido não encontrado", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[]]))
		);

		const result = await startPicking(ORDER_ID);
		expect(result).toMatchObject({ ok: false });
	});

	it("cria picking com status paid e transiciona para preparing", async () => {
		const captured: Record<string, unknown>[] = [];

		mockTransaction.mockImplementation(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
				// select[0]: lockOrderAndAuthorize FOR UPDATE
				// select[1]: orderItem[] for the order
				const mockTx = makeMockTx([
					[{ status: "paid", branchId: BRANCH_ID }],
					[
						{
							id: "item-1",
							variantId: "variant-1",
							quantity: 2,
							sku: "SKU-001",
							name: "Furadeira",
							barcode: "12345",
							voltage: "220V",
						},
					],
				]);
				mockTx._insertValues.mockImplementation(
					(vals: Record<string, unknown>) => {
						captured.push(vals);
						return Promise.resolve(undefined);
					}
				);
				return cb(mockTx);
			}
		);

		const result = await startPicking(ORDER_ID);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.pickingId).toBeDefined();
		}
		// Should have inserts: orderPicking + orderPickingItem(s) + orderStatusHistory
		expect(captured.length).toBeGreaterThanOrEqual(2);
	});

	it("retorna erro amigável em conflito 23505 (sessão duplicada)", async () => {
		const pgError = Object.assign(new Error("violates unique constraint"), {
			cause: {
				code: "23505",
				constraint: "order_picking_one_active",
				message: "violates unique constraint",
			},
		});

		mockTransaction.mockImplementation(() => {
			throw pgError;
		});

		const result = await startPicking(ORDER_ID);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"andamento"
		);
	});
});

// ---------------------------------------------------------------------------
// Tests: scanItem
// ---------------------------------------------------------------------------

describe("scanItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("retorna not_in_order quando código não casa com nenhum item", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						// picking row
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						// order lock
						[{ status: "preparing", branchId: BRANCH_ID }],
						// picking items — nenhum com barcode ou variantId que case
						[
							{
								id: PICKING_ITEM_ID,
								variantId: "variant-999",
								barcode: "99999",
								qtyExpected: 1,
								qtyPicked: 0,
								notFound: false,
							},
						],
						// toolVariant barcode lookup — empty (código não existe)
						[],
					])
				)
		);

		const result = await scanItem(PICKING_ID, "CODIGO_INVALIDO");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.kind).toBe("not_in_order");
		}
	});

	it("retorna already_complete quando item já atingiu qtyExpected", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						[{ status: "preparing", branchId: BRANCH_ID }],
						[
							{
								id: PICKING_ITEM_ID,
								variantId: "variant-1",
								variantSnapshot: {
									barcode: "BARCODE123",
									sku: "SKU-001",
									name: "Furadeira",
									voltage: "220V",
								},
								qtyExpected: 2,
								qtyPicked: 2, // já completo
								notFound: false,
							},
						],
						[], // toolVariant lookup
					])
				)
		);

		const result = await scanItem(PICKING_ID, "BARCODE123");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.kind).toBe("already_complete");
		}
	});

	it("retorna accepted e insere scan quando item aceito", async () => {
		const captured: Record<string, unknown>[] = [];

		mockTransaction.mockImplementation(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
				const mockTx = makeMockTx([
					[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
					[{ status: "preparing", branchId: BRANCH_ID }],
					[
						{
							id: PICKING_ITEM_ID,
							variantId: "variant-1",
							variantSnapshot: {
								barcode: "BARCODE123",
								sku: "SKU-001",
								name: "Furadeira",
								voltage: "220V",
							},
							qtyExpected: 2,
							qtyPicked: 1, // 1 de 2 — aceitar mais
							notFound: false,
						},
					],
					[], // toolVariant lookup
				]);
				mockTx._insertValues.mockImplementation(
					(vals: Record<string, unknown>) => {
						captured.push(vals);
						return Promise.resolve(undefined);
					}
				);
				return cb(mockTx);
			}
		);

		const result = await scanItem(PICKING_ID, "BARCODE123");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.kind).toBe("accepted");
		}
		// Should insert a scan record
		expect(captured.length).toBeGreaterThanOrEqual(1);
	});

	it("retorna { ok: false } quando picking não está in_progress", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "completed" }],
						[{ status: "preparing", branchId: BRANCH_ID }],
						[],
						[],
					])
				)
		);

		const result = await scanItem(PICKING_ID, "BARCODE123");
		expect(result).toMatchObject({ ok: false });
	});
});

// ---------------------------------------------------------------------------
// Tests: completePicking
// ---------------------------------------------------------------------------

describe("completePicking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("rejeita quando há item não resolvido (nem bipado nem ausente)", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						// picking row
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						// order lock
						[{ status: "preparing", branchId: BRANCH_ID }],
						// items — não completo
						[
							{
								id: PICKING_ITEM_ID,
								variantId: "variant-1",
								barcode: "BARCODE123",
								qtyExpected: 2,
								qtyPicked: 1, // incompleto
								notFound: false,
							},
						],
					])
				)
		);

		const result = await completePicking(PICKING_ID);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"restantes"
		);
	});

	it("marca completed quando todos os items estão conferidos", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						[{ status: "preparing", branchId: BRANCH_ID }],
						[
							{
								id: PICKING_ITEM_ID,
								variantId: "variant-1",
								barcode: "BARCODE123",
								qtyExpected: 2,
								qtyPicked: 2, // completo
								notFound: false,
							},
						],
					])
				)
		);

		const result = await completePicking(PICKING_ID);
		expect(result).toMatchObject({ ok: true });
	});

	it("finaliza com pendência quando há item ausente resolvido", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						[{ status: "preparing", branchId: BRANCH_ID }],
						[
							{
								id: PICKING_ITEM_ID,
								variantId: "variant-1",
								barcode: "BARCODE123",
								qtyExpected: 1,
								qtyPicked: 0,
								notFound: true, // ausente → finalizável como exceção
							},
						],
					])
				)
		);

		const result = await completePicking(PICKING_ID);
		expect(result).toMatchObject({ ok: true });
	});
});

// ---------------------------------------------------------------------------
// Tests: reportMissing
// ---------------------------------------------------------------------------

describe("reportMissing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("marca notFound no item e mantém a sessão in_progress", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						// picking item
						[{ id: PICKING_ITEM_ID, pickingId: PICKING_ID }],
						// picking row
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						// order lock
						[{ status: "preparing", branchId: BRANCH_ID }],
					])
				)
		);

		const result = await reportMissing(
			PICKING_ITEM_ID,
			"Item não encontrado no estoque"
		);
		expect(result).toMatchObject({ ok: true });
	});

	it("retorna { ok: false } quando picking item não existe", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[]]))
		);

		const result = await reportMissing(PICKING_ITEM_ID, "Motivo qualquer");
		expect(result).toMatchObject({ ok: false });
	});
});

// ---------------------------------------------------------------------------
// Tests: cancelPicking
// ---------------------------------------------------------------------------

describe("cancelPicking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("marca picking como canceled", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ id: PICKING_ID, orderId: ORDER_ID, status: "in_progress" }],
						[{ status: "preparing", branchId: BRANCH_ID }],
					])
				)
		);

		const result = await cancelPicking(PICKING_ID);
		expect(result).toMatchObject({ ok: true });
	});

	it("retorna { ok: false } quando picking não encontrado", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[]]))
		);

		const result = await cancelPicking(PICKING_ID);
		expect(result).toMatchObject({ ok: false });
	});
});
