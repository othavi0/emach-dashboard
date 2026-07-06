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

import { cancelPicking, completePicking, reportMissing } from "../actions";

const PICKING_ID = "3f2b7c1a-9d4e-4f6a-8b2c-1a2b3c4d5e6f";
const OWNER = "usr_owner";
const OWNERSHIP_ERROR_RE = /iniciou/i;
const STATUS_ERROR_RE = /andamento/i;

function makeTx(selectResults: unknown[][]) {
	let i = 0;
	const chain = (result: unknown[]) => {
		const c: Record<string, unknown> = {};
		c.from = vi.fn(() => c);
		c.where = vi.fn(() => c);
		c.for = vi.fn(() => c);
		c.limit = vi.fn(() => Promise.resolve(result));
		c.orderBy = vi.fn(() => c);
		return c;
	};
	const update = () => {
		const c: Record<string, unknown> = {};
		c.set = vi.fn(() => c);
		c.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return c;
	};
	return {
		select: vi.fn(() => chain(selectResults[i++] ?? [])),
		update: vi.fn(update),
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
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
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const allowed = await cancelPicking(PICKING_ID, "picker ausente");
		expect(allowed.ok).toBe(true);
	});
});
