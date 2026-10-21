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

import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { updateOrderStatus } from "../actions";

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const ACTOR_ID = "usr_42";

interface Item {
	id: string;
	name: string;
	quantity: number;
	sku: string | null;
	variantId: string;
}

interface Movement {
	actorId?: string | null;
	actorType?: string;
	branchId?: string | null;
	delta: number;
	newQty: number;
	orderId?: string | null;
	orderItemId?: string | null;
	previousQty: number;
	reason: string;
	variantId?: string | null;
}

/** O banco que o teste enxerga: só o que a transação confirmou. */
interface Store {
	items: Item[];
	levels: Record<string, number>;
	movements: Movement[];
	order: { branchId: string | null; couponId: string | null; status: string };
}

const dialect = new PgDialect();

function paramsOf(condition: SQL): string[] {
	return dialect.sqlToQuery(condition).params.map(String);
}

function levelKey(variantId: string, branchId: string): string {
	return `${variantId}@${branchId}`;
}

function thenable<T>(value: T) {
	return {
		// biome-ignore lint/suspicious/noThenProperty: mock do query builder thenable do Drizzle
		then: (resolve: (v: T) => void) => Promise.resolve(value).then(resolve),
	};
}

/**
 * Transação falsa sobre um rascunho do Store. Responde por tabela; a filial e a
 * variante de stock_level saem dos parâmetros do WHERE que a action monta.
 */
function makeTx(draft: Store) {
	const select = () => ({
		from: (table: Table) => {
			const name = getTableName(table);

			if (name === "order") {
				const chain = {
					where: () => chain,
					for: () => chain,
					limit: () => Promise.resolve([draft.order]),
				};

				return chain;
			}

			if (name === "order_item") {
				return {
					where: () => ({ orderBy: () => Promise.resolve(draft.items) }),
				};
			}

			if (name === "stock_level") {
				return {
					where: (condition: SQL) => ({
						for: () => {
							const [variantId = "", branchId = ""] = paramsOf(condition);
							const quantity = draft.levels[levelKey(variantId, branchId)];

							return Promise.resolve(
								quantity === undefined ? [] : [{ quantity }]
							);
						},
					}),
				};
			}

			throw new Error(`select inesperado em ${name}`);
		},
	});

	const insert = (table: Table) => ({
		values: (row: Movement) => ({
			...thenable(undefined),
			onConflictDoNothing: () => ({
				returning: () => {
					if (getTableName(table) !== "stock_movement") {
						throw new Error("onConflictDoNothing fora de stock_movement");
					}

					const duplicate = draft.movements.some(
						(m) =>
							m.reason === "saida_venda" && m.orderItemId === row.orderItemId
					);

					if (duplicate) {
						return Promise.resolve([]);
					}

					draft.movements.push(row);

					return Promise.resolve([{ id: "mv-novo" }]);
				},
			}),
		}),
	});

	const update = (table: Table) => ({
		set: (values: { quantity?: SQL; status?: string }) => ({
			where: (condition: SQL) => {
				const name = getTableName(table);

				if (name === "order" && values.status) {
					draft.order.status = values.status;
				}

				return {
					...thenable({ rowCount: 1 }),
					returning: () => {
						if (name !== "stock_level" || !values.quantity) {
							throw new Error(`returning inesperado em ${name}`);
						}

						const [variantId = "", branchId = "", atLeast] =
							paramsOf(condition);

						const [amount] = paramsOf(values.quantity);
						const key = levelKey(variantId, branchId);
						const current = draft.levels[key];

						if (current === undefined || current < Number(atLeast)) {
							return Promise.resolve([]);
						}

						draft.levels[key] = current - Number(amount);

						return Promise.resolve([{ quantity: draft.levels[key] }]);
					},
				};
			},
		}),
	});

	return { select, insert, update };
}

let store: Store;

function seed(partial: Partial<Store> & Pick<Store, "items" | "levels">) {
	store = {
		order: { status: "pending_payment", branchId: BRANCH_ID, couponId: null },
		movements: [],
		...partial,
	};
}

const FURADEIRA: Item = {
	id: "oi-1",
	variantId: "var-a",
	quantity: 2,
	name: "Furadeira de impacto",
	sku: "FUR-220",
};

const SERRA: Item = {
	id: "oi-2",
	variantId: "var-b",
	quantity: 1,
	name: "Serra circular",
	sku: "SER-110",
};

function markPaid() {
	return updateOrderStatus({ orderId: ORDER_ID, toStatus: "paid" });
}

describe("updateOrderStatus para paid debita o estoque da filial", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: ACTOR_ID, role: "admin" },
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

	it("decrementa stock_level e grava um saida_venda por item", async () => {
		seed({
			items: [FURADEIRA, SERRA],
			levels: {
				[levelKey("var-a", BRANCH_ID)]: 10,
				[levelKey("var-b", BRANCH_ID)]: 3,
			},
		});

		expect(await markPaid()).toEqual({ ok: true, data: undefined });
		expect(store.order.status).toBe("paid");
		expect(store.levels).toEqual({
			[levelKey("var-a", BRANCH_ID)]: 8,
			[levelKey("var-b", BRANCH_ID)]: 2,
		});
		expect(store.movements).toEqual([
			expect.objectContaining({
				reason: "saida_venda",
				delta: -2,
				previousQty: 10,
				newQty: 8,
				orderId: ORDER_ID,
				orderItemId: "oi-1",
				variantId: "var-a",
				branchId: BRANCH_ID,
				actorType: "user",
				actorId: ACTOR_ID,
			}),
			expect.objectContaining({
				reason: "saida_venda",
				delta: -1,
				previousQty: 3,
				newQty: 2,
				orderItemId: "oi-2",
				variantId: "var-b",
			}),
		]);
	});

	it("item que já tem saida_venda não debita de novo", async () => {
		const prior: Movement[] = [FURADEIRA, SERRA].map((item) => ({
			reason: "saida_venda",
			orderItemId: item.id,
			delta: -item.quantity,
			previousQty: 0,
			newQty: 0,
			actorType: "system",
		}));

		seed({
			items: [FURADEIRA, SERRA],
			levels: {
				[levelKey("var-a", BRANCH_ID)]: 8,
				[levelKey("var-b", BRANCH_ID)]: 2,
			},
			movements: prior,
		});

		expect(await markPaid()).toEqual({ ok: true, data: undefined });
		expect(store.levels).toEqual({
			[levelKey("var-a", BRANCH_ID)]: 8,
			[levelKey("var-b", BRANCH_ID)]: 2,
		});
		expect(store.movements).toEqual(prior);
	});

	it("pedido sem filial fica em pending_payment com a mensagem", async () => {
		seed({
			order: { status: "pending_payment", branchId: null, couponId: null },
			items: [FURADEIRA],
			levels: {},
		});

		expect(await markPaid()).toEqual({
			ok: false,
			error: "Atribua uma filial ao pedido antes de marcar como pago",
		});
		expect(store.order.status).toBe("pending_payment");
		expect(store.movements).toEqual([]);
	});

	it("estoque insuficiente recusa, nomeia a variante e não grava nada", async () => {
		seed({
			items: [FURADEIRA, SERRA],
			levels: {
				[levelKey("var-a", BRANCH_ID)]: 10,
				[levelKey("var-b", BRANCH_ID)]: 0,
			},
		});

		const result = await markPaid();

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.error).toContain(
			"Estoque insuficiente de Serra circular (SKU SER-110)"
		);
		expect(store.order.status).toBe("pending_payment");
		expect(store.movements).toEqual([]);
		expect(store.levels[levelKey("var-a", BRANCH_ID)]).toBe(10);
	});

	it("variante sem linha de stock_level conta como estoque zero", async () => {
		seed({ items: [SERRA], levels: {} });

		const result = await markPaid();

		expect(result.ok ? "" : result.error).toBe(
			"Estoque insuficiente de Serra circular (SKU SER-110) na filial do pedido: 0 disponível, o pedido pede 1"
		);
		expect(store.order.status).toBe("pending_payment");
	});
});
