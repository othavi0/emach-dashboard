import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — definidos antes dos vi.mock (padrão assign-branch.test.ts)
// ---------------------------------------------------------------------------

const {
	mockTransaction,
	mockDbSelect,
	mockRequireCapability,
	mockRequireCapabilityWithContext,
	mockGetUserBranchScope,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockDbSelect: vi.fn(),
	mockRequireCapability: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
	mockGetUserBranchScope: vi.fn(),
}));

// Mock @emach/db — bulkStartSeparation usa db.transaction (por pedido) e
// db.select (nome da filial de destino, lido uma vez fora do loop).
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction, select: mockDbSelect },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions — requireCapability/requireCapabilityWithContext são
// os gates checados (fail-fast fora do loop + dentro de lockOrderAndAuthorize).
vi.mock("@/lib/permissions", () => ({
	requireCapability: mockRequireCapability,
	requireCapabilityWithContext: mockRequireCapabilityWithContext,
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/branch-scope — usado dentro de lockOrderAndAuthorize pro caminho
// de pedido em triagem (branchId null).
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: mockGetUserBranchScope,
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));

// Mock next/cache — bulkStartSeparation chama revalidatePath E revalidateTag.
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

// Mock logger — evita ruído de console.
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock módulos de leitura que dependem de conexão real com @emach/db.
// ORDERS_COUNTS_TAG precisa estar presente: o finally de bulkStartSeparation
// chama revalidateTag(ORDERS_COUNTS_TAG, "max") (padrão ship-gating.test.ts /
// orders-read-guards.test.ts — gap não coberto por assign-branch.test.ts
// porque assignBranch singular não usa revalidateTag).
vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
	ORDERS_COUNTS_TAG: "orders-counts",
}));

vi.mock("../pending-data", () => ({
	fetchOrderActivityPage: vi.fn(),
	fetchPendingOrdersPage: vi.fn(),
}));

// Mock @/lib/session — usado transitivamente por @emach/auth/dashboard.
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

// ---------------------------------------------------------------------------
// Import depois dos mocks
// ---------------------------------------------------------------------------

import { bulkStartSeparation } from "../actions";
import { bulkStartSeparationSchema } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const ORDER_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const OWN_BRANCH_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const USER_ID = "usr_42";

function makeSelectChain(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	chain.from = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	chain.for = vi.fn(() => chain);
	chain.limit = vi.fn(() => Promise.resolve(result));
	return chain;
}

/**
 * Tx mockada de UM pedido. `selectResults` são os resultados, em ordem, dos
 * `tx.select(...)` disparados por esse pedido: [0] = lock (status+branchId),
 * [1] = número do pedido. Update/insert são capturados p/ asserção.
 */
function makeMockTx(selectResults: unknown[][]) {
	let selectCallIdx = 0;
	const insertedRows: Record<string, unknown>[] = [];
	const updateSets: Record<string, unknown>[] = [];

	const makeUpdateChain = () => {
		const chain: Record<string, unknown> = {};
		chain.set = vi.fn((vals: Record<string, unknown>) => {
			updateSets.push(vals);
			return chain;
		});
		chain.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return chain;
	};

	const makeInsertChain = () => ({
		values: vi.fn((vals: Record<string, unknown>) => {
			insertedRows.push(vals);
			return Promise.resolve(undefined);
		}),
	});

	return {
		select: vi.fn(() => {
			const result = selectResults[selectCallIdx++] ?? [];
			return makeSelectChain(result);
		}),
		update: vi.fn(() => makeUpdateChain()),
		insert: vi.fn(() => makeInsertChain()),
		_insertedRows: insertedRows,
		_updateSets: updateSets,
	};
}

/** Encadeia uma tx mockada por pedido, na ordem em que orderIds é iterado. */
function queueTransactions(txs: ReturnType<typeof makeMockTx>[]) {
	let callIdx = 0;
	mockTransaction.mockImplementation(
		(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
			const tx = txs[callIdx++];
			if (!tx) {
				throw new Error("queueTransactions: fila de tx mockada esgotada");
			}
			return cb(tx);
		}
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkStartSeparationSchema", () => {
	it("aceita orderIds sem branchId (comportamento atual)", () => {
		const result = bulkStartSeparationSchema.safeParse({ orderIds: [ORDER_A] });
		expect(result.success).toBe(true);
	});

	it("aceita branchId opcional junto de orderIds", () => {
		const result = bulkStartSeparationSchema.safeParse({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita branchId em formato inválido", () => {
		const result = bulkStartSeparationSchema.safeParse({
			orderIds: [ORDER_A],
			branchId: "não-é-uuid",
		});
		expect(result.success).toBe(false);
	});
});

describe("bulkStartSeparation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue({ user: { id: USER_ID } });
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID },
		});
		mockGetUserBranchScope.mockResolvedValue({ kind: "all" });
		mockDbSelect.mockReturnValue(makeSelectChain([{ name: "Filial Destino" }]));
	});

	it("(a) sem branchId — pedido pago sem filial própria é pulado com 'sem filial' (comportamento atual intacto)", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0001" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({ orderIds: [ORDER_A] });

		expect(result).toEqual({
			ok: true,
			data: {
				moved: 0,
				movedIds: [],
				skipped: [{ number: "EM-2026-0001", reason: "sem filial" }],
			},
		});
		expect(mockRequireCapability).toHaveBeenCalledWith("orders.update_status");
		expect(mockRequireCapabilityWithContext).not.toHaveBeenCalled();
		expect(tx._updateSets).toHaveLength(0);
	});

	it("(b) com branchId — aplica ao pedido sem filial própria e grava orderEvent branch_assigned", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0002" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: { moved: 1, movedIds: [ORDER_A], skipped: [] },
		});

		// Fail-fast: capability checada contra a filial de DESTINO antes do loop.
		expect(mockRequireCapabilityWithContext).toHaveBeenCalledWith(
			"orders.update_status",
			{ targetBranchIds: [BRANCH_ID] }
		);

		// UPDATE aplica a filial informada junto da transição de status.
		expect(tx._updateSets).toHaveLength(1);
		expect(tx._updateSets[0]).toMatchObject({
			status: "preparing",
			branchId: BRANCH_ID,
		});

		// orderEvent branch_assigned auditado, igual ao assignBranch singular.
		const branchEvent = tx._insertedRows.find(
			(row) => row.eventType === "branch_assigned"
		);
		expect(branchEvent).toMatchObject({
			orderId: ORDER_A,
			eventType: "branch_assigned",
			metadata: { branchId: BRANCH_ID, branchName: "Filial Destino" },
			actorType: "user",
			actorUserId: USER_ID,
		});
	});

	it("(c) com branchId — pedido que já tem filial mantém a sua (não sobrescreve, sem orderEvent)", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: OWN_BRANCH_ID }],
			[{ number: "EM-2026-0003" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: { moved: 1, movedIds: [ORDER_A], skipped: [] },
		});

		expect(tx._updateSets).toHaveLength(1);
		expect(tx._updateSets[0]).toMatchObject({ status: "preparing" });
		expect(tx._updateSets[0]?.branchId).toBeUndefined();

		const branchEvent = tx._insertedRows.find(
			(row) => row.eventType === "branch_assigned"
		);
		expect(branchEvent).toBeUndefined();
	});

	it("(d) com branchId — sem escopo na filial de destino aborta o lote antes do loop (nenhuma transação aberta)", async () => {
		mockRequireCapabilityWithContext.mockRejectedValueOnce(
			new Error("Forbidden: sem acesso à filial de destino")
		);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: false,
			error: "Sem permissão para alterar pedidos.",
		});
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("(e) com branchId inexistente — retorna 'Filial não encontrada' sem iterar o lote", async () => {
		mockDbSelect.mockReturnValue(makeSelectChain([]));

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({ ok: false, error: "Filial não encontrada" });
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("(f) lote misto: um pedido é movido e outro é pulado por status diferente de paid", async () => {
		const txA = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0004" }],
		]);
		const txB = makeMockTx([
			[{ status: "preparing", branchId: OWN_BRANCH_ID }],
			[{ number: "EM-2026-0005" }],
		]);
		queueTransactions([txA, txB]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A, ORDER_B],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: {
				moved: 1,
				movedIds: [ORDER_A],
				skipped: [{ number: "EM-2026-0005", reason: "não está mais em Pago" }],
			},
		});
	});
});
