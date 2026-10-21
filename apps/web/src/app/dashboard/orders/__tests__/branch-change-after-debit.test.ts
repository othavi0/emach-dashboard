import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockDbSelect, mockRequireCapabilityWithContext } =
	vi.hoisted(() => ({
		mockTransaction: vi.fn(),
		mockDbSelect: vi.fn(),
		mockRequireCapabilityWithContext: vi.fn(),
	}));

vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction, select: mockDbSelect },
	createDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi
		.fn()
		.mockResolvedValue({ user: { id: "usr_42", role: "admin" } }),
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
import { assignBranch, bulkAssignBranch, updateOrderStatus } from "../actions";

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const DEBITED_BRANCH = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_BRANCH = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

const LOCKED_MESSAGE =
	"O estoque deste pedido já saiu da filial atual quando ele foi pago. A filial não pode mais ser trocada.";

/** O banco que o teste enxerga: só o que a transação confirmou. */
interface Store {
	movements: { orderId: string; reason: string }[];
	order: {
		branchId: string | null;
		couponId: string | null;
		number: string;
		status: string;
	};
}

let store: Store;

function chainResolving(rows: unknown[]) {
	const chain = {
		where: () => chain,
		for: () => chain,
		limit: () => Promise.resolve(rows),
	};

	return chain;
}

/** Transação falsa que responde por tabela sobre um rascunho do Store. */
function makeTx(draft: Store) {
	return {
		select: () => ({
			from: (table: Table) => {
				const name = getTableName(table);

				if (name === "order") {
					return chainResolving([draft.order]);
				}

				if (name === "stock_movement") {
					return chainResolving(
						draft.movements.filter(
							(m) => m.orderId === ORDER_ID && m.reason === "saida_venda"
						)
					);
				}

				if (name === "branch") {
					return chainResolving([{ name: "Filial Destino" }]);
				}

				throw new Error(`select inesperado em ${name}`);
			},
		}),
		update: (table: Table) => ({
			set: (values: { branchId?: string; status?: string }) => ({
				where: () => {
					if (getTableName(table) === "order") {
						draft.order = { ...draft.order, ...values };
					}

					return Promise.resolve({ rowCount: 1 });
				},
			}),
		}),
		insert: () => ({ values: () => Promise.resolve(undefined) }),
	};
}

function seed(status: string, debited: boolean) {
	store = {
		order: {
			status,
			branchId: DEBITED_BRANCH,
			couponId: null,
			number: "EM-1042",
		},
		movements: debited ? [{ orderId: ORDER_ID, reason: "saida_venda" }] : [],
	};
}

describe("troca de filial de pedido já debitado (#443)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: "usr_42", role: "admin" },
		});
		mockDbSelect.mockReturnValue({
			from: () => chainResolving([{ name: "Filial Destino" }]),
		});
		mockTransaction.mockImplementation(
			async <T>(cb: (tx: ReturnType<typeof makeTx>) => Promise<T>) => {
				const draft = structuredClone(store);
				const result = await cb(makeTx(draft));
				store = draft;

				return result;
			}
		);
	});

	it("assignBranch recusa com a mensagem e o pedido fica na filial do débito", async () => {
		seed("paid", true);

		const result = await assignBranch({
			orderId: ORDER_ID,
			branchId: OTHER_BRANCH,
		});

		expect(result).toEqual({ ok: false, error: LOCKED_MESSAGE });
		expect(store.order.branchId).toBe(DEBITED_BRANCH);
	});

	it("assignBranch troca a filial de pedido sem débito", async () => {
		seed("pending_payment", false);

		const result = await assignBranch({
			orderId: ORDER_ID,
			branchId: OTHER_BRANCH,
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(store.order.branchId).toBe(OTHER_BRANCH);
	});

	it("bulkAssignBranch pula o pedido debitado com motivo", async () => {
		seed("paid", true);

		const result = await bulkAssignBranch({
			orderIds: [ORDER_ID],
			branchId: OTHER_BRANCH,
		});

		expect(result).toEqual({
			ok: true,
			data: {
				assigned: 0,
				skipped: [
					{ number: "EM-1042", reason: "estoque já saiu da filial atual" },
				],
			},
		});
		expect(store.order.branchId).toBe(DEBITED_BRANCH);
	});

	it("enviar para separação em outra filial recusa pedido debitado", async () => {
		seed("paid", true);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "preparing",
			branchId: OTHER_BRANCH,
		});

		expect(result).toEqual({ ok: false, error: LOCKED_MESSAGE });
		expect(store.order).toMatchObject({
			status: "paid",
			branchId: DEBITED_BRANCH,
		});
	});

	it("enviar para separação na própria filial segue livre", async () => {
		seed("paid", true);

		const result = await updateOrderStatus({
			orderId: ORDER_ID,
			toStatus: "preparing",
			branchId: DEBITED_BRANCH,
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(store.order.status).toBe("preparing");
	});
});
