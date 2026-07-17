import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockLockOrderAndAuthorize } = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockLockOrderAndAuthorize: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));
vi.mock("../../orders/actions", () => ({
	lockOrderAndAuthorize: mockLockOrderAndAuthorize,
}));
vi.mock("../../orders/data", () => ({
	ORDERS_COUNTS_TAG: "orders-counts",
}));
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi
		.fn()
		.mockResolvedValue({ user: { id: "usr_1", role: "user" } }),
}));
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	orderInScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));
vi.mock("../data", () => ({
	fetchPickingQueuePage: vi.fn(),
	getActivePickingForUser: vi.fn(),
	getPickingForOrder: vi.fn(),
	getOrderBranchId: vi.fn(),
	getLatestPicking: vi.fn(),
	isPickingCompleteForShip: vi.fn(),
}));

import {
	bulkStartPicking,
	cancelPicking,
	completePicking,
	reportMissing,
	scanItem,
	startPicking,
	takeoverPicking,
} from "../actions";

const PICKING_ID = "3f2b7c1a-9d4e-4f6a-8b2c-1a2b3c4d5e6f";
const OWNER = "usr_owner";
const OWNERSHIP_ERROR_RE = /iniciou/i;
const STATUS_ERROR_RE = /andamento/i;
const EXCEPTION_OWNER_ERROR_RE = /João/;

function makeTx(selectResults: unknown[][]) {
	let i = 0;
	// Closure gravando o último argumento passado a `.set()` — permite asserção
	// de auditoria (status/actor/reason) sem reimplementar um mock de update.
	const captured: { lastSetArg: unknown } = { lastSetArg: undefined };
	const chain = (result: unknown[]) => {
		const c: Record<string, unknown> = {
			// biome-ignore lint/suspicious/noThenProperty: thenable mock — allows `await tx.select()...where()` without a terminal `.limit()` (createPickingItems' orderItem load)
			then: (resolve: (v: unknown) => void) => resolve(result),
		};
		c.from = vi.fn(() => c);
		c.leftJoin = vi.fn(() => c);
		c.where = vi.fn(() => c);
		c.for = vi.fn(() => c);
		c.limit = vi.fn(() => Promise.resolve(result));
		c.orderBy = vi.fn(() => c);
		return c;
	};
	const update = () => {
		const c: Record<string, unknown> = {};
		c.set = vi.fn((arg: unknown) => {
			captured.lastSetArg = arg;
			return c;
		});
		c.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return c;
	};
	return {
		select: vi.fn(() => chain(selectResults[i++] ?? [])),
		update: vi.fn(update),
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
		captured,
	};
}

function sessionAs(id: string, role: "user" | "admin" | "super_admin") {
	return {
		status: "preparing",
		branchId: "br_1",
		session: { user: { id, role, name: "Ana" } },
	};
}

const PICKING_IN_PROGRESS = {
	id: PICKING_ID,
	orderId: "ord_1",
	status: "in_progress",
	pickerUserId: OWNER,
	pickerName: "João",
};

describe("guards de sessão de separação", () => {
	beforeEach(() => vi.clearAllMocks());

	it("completePicking por não-dono → erro de ownership", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await completePicking(PICKING_ID);
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			OWNERSHIP_ERROR_RE
		);
	});

	it("reportMissing com sessão completed → erro de status", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(
				makeTx([
					[{ id: "pi_1", pickingId: PICKING_ID }],
					[{ ...PICKING_IN_PROGRESS, status: "completed" }],
				])
			)
		);
		const result = await reportMissing("pi_1", "faltou na prateleira");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			STATUS_ERROR_RE
		);
	});

	it("cancelPicking de sessão já completed → erro de status", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ ...PICKING_IN_PROGRESS, status: "completed" }]]))
		);
		const result = await cancelPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("cancelPicking por não-dono role user → recusado; por admin → aceito", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const denied = await cancelPicking(PICKING_ID);
		expect(denied.ok).toBe(false);

		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		const adminTx = makeTx([[PICKING_IN_PROGRESS]]);
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(adminTx)
		);
		const allowed = await cancelPicking(PICKING_ID, "picker ausente");
		expect(allowed.ok).toBe(true);
		// Auditoria (T5#2): status + ator + motivo persistidos no update.
		expect(adminTx.captured.lastSetArg).toMatchObject({
			status: "canceled",
			canceledByUserId: "usr_adm",
			cancelReason: "picker ausente",
		});
	});

	it("scanItem por não-dono → erro de ownership", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await scanItem(PICKING_ID, "7891234560016");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			OWNERSHIP_ERROR_RE
		);
	});

	it("reportMissing por não-dono → erro de ownership", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(
				makeTx([[{ id: "pi_1", pickingId: PICKING_ID }], [PICKING_IN_PROGRESS]])
			)
		);
		const result = await reportMissing("pi_1", "faltou na prateleira");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			OWNERSHIP_ERROR_RE
		);
	});

	it("takeoverPicking em sessão completed → erro de status", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ ...PICKING_IN_PROGRESS, status: "completed" }]]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			STATUS_ERROR_RE
		);
	});

	it("takeoverPicking por role user → recusado", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("takeoverPicking da própria sessão → recusado (é só continuar)", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("takeoverPicking por admin em sessão alheia in_progress → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS], []]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(true);
	});

	const LATEST_EXCEPTION = {
		pickerName: "João",
		pickerUserId: OWNER,
		status: "exception",
	};

	it("startPicking sobre exceção alheia por role user → recusado", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION]]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(
			EXCEPTION_OWNER_ERROR_RE
		);
	});

	it("startPicking sobre a própria exceção por role user → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		// selects: [última sessão] e depois [itens do pedido] (createPickingItems)
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("startPicking sobre exceção alheia por admin → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("startPicking sobre sessão canceled de outro → ok (pool geral)", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ ...LATEST_EXCEPTION, status: "canceled" }], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("bulkStartPicking pula exceção alheia com reason, sem derrubar o lote", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		// selects por pedido: [number], [sessão in_progress existente → nenhuma],
		// [última sessão → exceção alheia]
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ number: "EM-1" }], [], [LATEST_EXCEPTION]]))
		);
		const result = await bulkStartPicking({
			orderIds: ["3f2b7c1a-9d4e-4f6a-8b2c-1a2b3c4d5e6f"],
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.moved).toBe(0);
			expect(result.data.skipped).toEqual([
				{ number: "EM-1", reason: "exceção de outro operador" },
			]);
		}
	});
});
