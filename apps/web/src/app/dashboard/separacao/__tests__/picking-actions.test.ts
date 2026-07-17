import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — defined before vi.mock calls
// ---------------------------------------------------------------------------

const {
	mockTransaction,
	mockRequireCapability,
	mockRequireCapabilityWithContext,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockRequireCapability: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
}));

// Mock @emach/db — only needs db.transaction for actions
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions
vi.mock("@/lib/permissions", () => {
	// Default idêntico ao anterior — vários describes existentes (scanItem,
	// completePicking, confirmItemManually, cancelPicking, guard tests)
	// dependem de pickerUserId "usr_1" bater com este default nos asserts de
	// assertOwner. NÃO alterar este valor.
	mockRequireCapabilityWithContext.mockResolvedValue({
		user: { id: "usr_1", name: "Picker" },
	});
	return {
		requireCapability: mockRequireCapability,
		requireCapabilityWithContext: mockRequireCapabilityWithContext,
		getUserCapabilities: vi.fn().mockResolvedValue([]),
		roleHasCapability: vi.fn().mockReturnValue(true),
		can: vi.fn().mockResolvedValue(true),
	};
});

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
	bulkStartPicking,
	cancelPicking,
	completePicking,
	confirmItemManually,
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
					[
						{
							id: PICKING_ID,
							orderId: ORDER_ID,
							status: "in_progress",
							pickerUserId: "usr_1",
							pickerName: "Picker",
						},
					],
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
		if (result.ok) {
			expect(result.data.finalStatus).toBe("completed");
		}
	});

	it("finaliza com pendência quando há item ausente resolvido", async () => {
		mockTransaction.mockImplementation(
			async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
		if (result.ok) {
			expect(result.data.finalStatus).toBe("exception");
		}
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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
// Tests: confirmItemManually
// ---------------------------------------------------------------------------

describe("confirmItemManually", () => {
	const VALID_REASON = "Etiqueta física rasgada na caixa";

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	function armTx(selectResults: unknown[][]) {
		let tx: ReturnType<typeof makeMockTx> | undefined;
		const captured: Record<string, unknown>[] = [];
		mockTransaction.mockImplementation(
			async (cb: (t: ReturnType<typeof makeMockTx>) => unknown) => {
				tx = makeMockTx(selectResults);
				tx._insertValues.mockImplementation((vals: Record<string, unknown>) => {
					captured.push(vals);
					return Promise.resolve(undefined);
				});
				return await cb(tx);
			}
		);
		return { getTx: () => tx, captured };
	}

	const OWNED_PICKING = {
		id: PICKING_ID,
		orderId: ORDER_ID,
		status: "in_progress",
		pickerUserId: "usr_1",
		pickerName: "Picker",
	};
	const PREPARING_LOCK = { status: "preparing", branchId: BRANCH_ID };

	function itemRow(overrides: Record<string, unknown> = {}) {
		return {
			id: PICKING_ITEM_ID,
			pickingId: PICKING_ID,
			variantId: "variant-1",
			qtyExpected: 3,
			qtyPicked: 1,
			notFound: false,
			...overrides,
		};
	}

	it("incrementa qtyPicked e insere 1 scan manual por unidade", async () => {
		const { getTx, captured } = armTx([
			[itemRow()],
			[OWNED_PICKING],
			[PREPARING_LOCK],
		]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 2, VALID_REASON);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.data).toEqual({ qtyPicked: 3, qtyExpected: 3 });
		}
		expect(captured).toHaveLength(2);
		for (const scan of captured) {
			expect(scan).toMatchObject({
				pickingItemId: PICKING_ITEM_ID,
				scannedCode: "manual",
				manual: true,
				manualReason: VALID_REASON,
			});
		}
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ qtyPicked: 3, notFound: false })
		);
	});

	it("rejeita motivo com menos de 10 caracteres", async () => {
		armTx([[itemRow()], [OWNED_PICKING], [PREPARING_LOCK]]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 1, "curto");
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain("10");
	});

	it("rejeita quantidade acima do restante", async () => {
		armTx([[itemRow()], [OWNED_PICKING], [PREPARING_LOCK]]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 3, VALID_REASON);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"restante"
		);
	});

	it("rejeita quantidade não inteira ou menor que 1", async () => {
		armTx([[itemRow()], [OWNED_PICKING], [PREPARING_LOCK]]);

		const zero = await confirmItemManually(PICKING_ITEM_ID, 0, VALID_REASON);
		expect(zero).toMatchObject({ ok: false });

		armTx([[itemRow()], [OWNED_PICKING], [PREPARING_LOCK]]);
		const frac = await confirmItemManually(PICKING_ITEM_ID, 1.5, VALID_REASON);
		expect(frac).toMatchObject({ ok: false });
	});

	it("rejeita item já completo", async () => {
		armTx([[itemRow({ qtyPicked: 3 })], [OWNED_PICKING], [PREPARING_LOCK]]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 1, VALID_REASON);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"completo"
		);
	});

	it("limpa notFound de item antes reportado como ausente", async () => {
		const { getTx } = armTx([
			[itemRow({ notFound: true, qtyPicked: 0 })],
			[OWNED_PICKING],
			[PREPARING_LOCK],
		]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 3, VALID_REASON);
		expect(result).toMatchObject({ ok: true });
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ qtyPicked: 3, notFound: false })
		);
	});

	it("rejeita quando outro usuário tenta confirmar", async () => {
		armTx([
			[itemRow()],
			[{ ...OWNED_PICKING, pickerUserId: "usr_outro" }],
			[PREPARING_LOCK],
		]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 1, VALID_REASON);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain("iniciou");
	});

	it("encerra a sessão quando o pedido saiu de preparing", async () => {
		const { getTx } = armTx([
			[itemRow()],
			[OWNED_PICKING],
			[{ status: "canceled", branchId: BRANCH_ID }],
		]);

		const result = await confirmItemManually(PICKING_ITEM_ID, 1, VALID_REASON);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"encerrada"
		);
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ canceledByName: "Sistema", status: "canceled" })
		);
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
						[
							{
								id: PICKING_ID,
								orderId: ORDER_ID,
								status: "in_progress",
								pickerUserId: "usr_1",
								pickerName: "Picker",
							},
						],
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

// ---------------------------------------------------------------------------
// Tests: guard — pedido saiu de preparing durante picking ativo
// ---------------------------------------------------------------------------

describe("guard: pedido saiu de preparing durante picking ativo", () => {
	const OWNED_PICKING = {
		id: PICKING_ID,
		orderId: ORDER_ID,
		status: "in_progress",
		pickerUserId: "usr_1",
		pickerName: "Picker",
	};
	const CANCELED_LOCK = { status: "canceled", branchId: BRANCH_ID };

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	function armTx(selectResults: unknown[][]) {
		let tx: ReturnType<typeof makeMockTx> | undefined;
		mockTransaction.mockImplementation(
			async (cb: (t: ReturnType<typeof makeMockTx>) => unknown) => {
				tx = makeMockTx(selectResults);
				return await cb(tx);
			}
		);
		return () => tx;
	}

	it("scanItem encerra a sessão e retorna erro amigável", async () => {
		const getTx = armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await scanItem(PICKING_ID, "7891234567890");
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"encerrada"
		);
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ canceledByName: "Sistema", status: "canceled" })
		);
	});

	it("completePicking idem", async () => {
		const getTx = armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await completePicking(PICKING_ID);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"encerrada"
		);
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ canceledByName: "Sistema", status: "canceled" })
		);
	});

	it("reportMissing idem", async () => {
		const getTx = armTx([
			[{ id: PICKING_ITEM_ID, pickingId: PICKING_ID }],
			[OWNED_PICKING],
			[CANCELED_LOCK],
		]);
		const result = await reportMissing(
			PICKING_ITEM_ID,
			"não achei na prateleira"
		);
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"encerrada"
		);
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ canceledByName: "Sistema", status: "canceled" })
		);
	});

	it("cancelPicking SEGUE permitido com pedido cancelado", async () => {
		armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await cancelPicking(PICKING_ID, "limpeza");
		expect(result).toMatchObject({ ok: true });
	});
});

// ---------------------------------------------------------------------------
// Tests: bulkStartPicking
// ---------------------------------------------------------------------------

describe("bulkStartPicking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	it("rejeita lote com mais de 20 pedidos (zod)", async () => {
		const orderIds = Array.from(
			{ length: 21 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
		);

		const result = await bulkStartPicking({ orderIds });

		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain("20");
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("pula pedido com corrida no unique constraint (23505) e segue ok", async () => {
		const pgError = Object.assign(new Error("violates unique constraint"), {
			cause: {
				code: "23505",
				constraint: "order_picking_one_active",
				message: "violates unique constraint",
			},
		});

		mockTransaction.mockImplementationOnce(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
				const tx = makeMockTx([
					[{ status: "preparing", branchId: BRANCH_ID }], // lockOrderAndAuthorize
					[{ number: "EM-2026-0001" }], // order.number (label)
					[], // existingSession pré-check — nenhuma
				]);
				tx._insertValues.mockRejectedValueOnce(pgError);
				return cb(tx);
			}
		);

		const result = await bulkStartPicking({ orderIds: [ORDER_ID] });

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.data.moved).toBe(0);
			expect(result.data.movedIds).toEqual([]);
			expect(result.data.skipped).toEqual([
				{ number: ORDER_ID.slice(0, 8), reason: "já em separação" },
			]);
		}
	});

	it("transiciona paid→preparing e grava history ao criar a sessão", async () => {
		const captured: Record<string, unknown>[] = [];
		let tx: ReturnType<typeof makeMockTx> | undefined;

		mockTransaction.mockImplementationOnce(
			(cb: (t: ReturnType<typeof makeMockTx>) => unknown) => {
				tx = makeMockTx([
					[{ status: "paid", branchId: BRANCH_ID }], // lockOrderAndAuthorize
					[{ number: "EM-2026-0002" }], // order.number (label)
					[], // existingSession — nenhuma sessão ativa
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
					], // createPickingItems: orderItem[]
				]);
				tx._insertValues.mockImplementation((vals: Record<string, unknown>) => {
					captured.push(vals);
					return Promise.resolve(undefined);
				});
				return cb(tx);
			}
		);

		const result = await bulkStartPicking({ orderIds: [ORDER_ID] });

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.data.moved).toBe(1);
			expect(result.data.movedIds).toEqual([ORDER_ID]);
			expect(result.data.skipped).toEqual([]);
		}

		const updateChain = tx?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "preparing" })
		);

		expect(captured).toContainEqual(
			expect.objectContaining({
				orderId: ORDER_ID,
				fromStatus: "paid",
				toStatus: "preparing",
				actorType: "user",
			})
		);
	});

	it("processa múltiplos pedidos e agrega moved/movedIds", async () => {
		const ORDER_ID_2 = "a1eac10b-58cc-4372-a567-0e02b2c3d480";

		mockTransaction.mockImplementationOnce(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ status: "preparing", branchId: BRANCH_ID }],
						[{ number: "EM-2026-0003" }],
						[],
						[],
					])
				)
		);
		mockTransaction.mockImplementationOnce(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ status: "preparing", branchId: BRANCH_ID }],
						[{ number: "EM-2026-0004" }],
						[],
						[],
					])
				)
		);

		const result = await bulkStartPicking({
			orderIds: [ORDER_ID, ORDER_ID_2],
		});

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.data.moved).toBe(2);
			expect(result.data.movedIds).toEqual([ORDER_ID, ORDER_ID_2]);
			expect(result.data.skipped).toEqual([]);
		}
		expect(mockTransaction).toHaveBeenCalledTimes(2);
	});

	it("pedido fora do escopo de filial é pulado sem abortar o lote", async () => {
		const ORDER_ID_2 = "a1eac10b-58cc-4372-a567-0e02b2c3d480";

		mockRequireCapabilityWithContext.mockRejectedValueOnce(
			new Error("Forbidden: filial fora do escopo do ator")
		);

		mockTransaction.mockImplementationOnce(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(makeMockTx([[{ status: "preparing", branchId: BRANCH_ID }]]))
		);
		mockTransaction.mockImplementationOnce(
			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
				cb(
					makeMockTx([
						[{ status: "preparing", branchId: BRANCH_ID }],
						[{ number: "EM-2026-0005" }],
						[],
						[],
					])
				)
		);

		const result = await bulkStartPicking({
			orderIds: [ORDER_ID, ORDER_ID_2],
		});

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.data.moved).toBe(1);
			expect(result.data.movedIds).toEqual([ORDER_ID_2]);
			expect(result.data.skipped).toEqual([
				{ number: ORDER_ID.slice(0, 8), reason: "fora do seu escopo" },
			]);
		}
	});
});
