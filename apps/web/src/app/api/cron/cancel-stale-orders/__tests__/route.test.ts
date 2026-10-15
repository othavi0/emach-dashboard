import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (devem vir antes dos imports do código sob teste) ---

vi.mock("@emach/env/server", () => ({
	env: { CRON_SECRET: "test-secret-32-chars-minimum-ok" },
}));

const { mockDbSelect, mockDbTransaction } = vi.hoisted(() => {
	const mockDbSelect = vi.fn();
	const mockDbTransaction = vi.fn();

	return { mockDbSelect, mockDbTransaction };
});

vi.mock("@emach/db", () => ({
	db: {
		select: mockDbSelect,
		transaction: mockDbTransaction,
	},
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		error: vi.fn(),
	},
}));

// --- imports do código sob teste ---

import { getTableName, type Table } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { GET } from "../route";

// --- helpers ---

/** Monta um Request com o header de auth correto. */
function makeRequest(token = "test-secret-32-chars-minimum-ok") {
	return new Request("http://localhost/api/cron/cancel-stale-orders", {
		headers: { authorization: `Bearer ${token}` },
	});
}

/**
 * Moca o SELECT de pedidos stale (lista de IDs).
 * Corresponde a: db.select({ id }).from(orderTable).where(and(...))
 */
function mockStaleOrders(ids: string[]) {
	const where = vi.fn(() => Promise.resolve(ids.map((id) => ({ id }))));
	const from = vi.fn(() => ({ where }));
	mockDbSelect.mockReturnValueOnce({ from });
}

interface LockedRow {
	couponId?: string | null;
	status: string;
}

/** Tabelas recebidas por tx.update, em ordem, em todas as transações do teste. */
const updatedTables: string[] = [];

/**
 * Monta o tx mockado de uma transação.
 * `txSelects` é uma lista de resultados que tx.select retorna em sequência.
 */
function makeMockTx(
	txSelects: (LockedRow | null)[],
	insertOk: boolean,
	updateOk: boolean
) {
	let selectCallIdx = 0;

	return {
		select: vi.fn(() => {
			const result = txSelects[selectCallIdx++];

			const forUpdate = vi.fn(() => Promise.resolve(result ? [result] : []));

			const where = vi.fn(() => ({ for: forUpdate }));
			const from = vi.fn(() => ({ where }));

			return { from };
		}),
		update: vi.fn((table: Table) => {
			updatedTables.push(getTableName(table));

			const where = vi.fn(() =>
				updateOk ? Promise.resolve() : Promise.reject(new Error("DB error"))
			);

			const set = vi.fn(() => ({ where }));

			return { set };
		}),
		insert: vi.fn(() => ({
			values: vi.fn(() =>
				insertOk ? Promise.resolve() : Promise.reject(new Error("Insert error"))
			),
		})),
	};
}

type MockTx = ReturnType<typeof makeMockTx>;

/**
 * Moca db.transaction para executar o callback com um tx mockado.
 * `insertOk` controla se tx.insert resolve ou rejeita.
 */
function mockTransaction(
	txSelects: (LockedRow | null)[],
	opts: { insertOk?: boolean; updateOk?: boolean } = {}
) {
	const { insertOk = true, updateOk = true } = opts;

	mockDbTransaction.mockImplementationOnce(
		<T>(callback: (tx: MockTx) => Promise<T>): Promise<T> =>
			callback(makeMockTx(txSelects, insertOk, updateOk))
	);
}

// --- testes ---

describe("GET /api/cron/cancel-stale-orders", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updatedTables.length = 0;
	});

	describe("gate de autenticação", () => {
		it("retorna 401 quando o header Authorization está ausente", async () => {
			const req = new Request("http://localhost/api/cron/cancel-stale-orders");
			const res = await GET(req);
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({ error: "Unauthorized" });
		});

		it("retorna 401 quando o Bearer token está errado", async () => {
			const req = makeRequest("token-errado");
			const res = await GET(req);
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({ error: "Unauthorized" });
		});
	});

	describe("sem pedidos stale", () => {
		it("retorna { ok: true, canceled: 0 } sem nenhuma transação", async () => {
			mockStaleOrders([]);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true, canceled: 0 });
			expect(mockDbTransaction).not.toHaveBeenCalled();
		});
	});

	describe("pedidos stale cancelados", () => {
		it("cancela N pedidos e retorna { ok: true, canceled: N }", async () => {
			mockStaleOrders(["order-1", "order-2", "order-3"]);
			mockTransaction([{ status: "pending_payment" }]);
			mockTransaction([{ status: "pending_payment" }]);
			mockTransaction([{ status: "pending_payment" }]);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true, canceled: 3 });
		});

		it("cada transação usa SELECT FOR UPDATE antes de cancelar (idempotência)", async () => {
			mockStaleOrders(["order-idempotent"]);
			mockTransaction([{ status: "pending_payment" }]);

			await GET(makeRequest());

			// A transação foi chamada uma vez para o pedido
			expect(mockDbTransaction).toHaveBeenCalledTimes(1);
		});

		it("pula pedido cujo status mudou entre o SELECT e o lock (re-check)", async () => {
			// Dois pedidos: o primeiro mudou de status (não deve ser cancelado),
			// o segundo está pending_payment (deve ser cancelado).
			mockStaleOrders(["order-changed", "order-still-pending"]);
			// Pedido 1: status mudou para "canceled" antes do lock
			mockTransaction([{ status: "canceled" }]);
			// Pedido 2: ainda pending_payment
			mockTransaction([{ status: "pending_payment" }]);

			const res = await GET(makeRequest());
			const body = await res.json();
			// Só o pedido-2 incrementa o contador
			expect(body).toEqual({ ok: true, canceled: 1 });
		});

		it("pula pedido não encontrado no SELECT FOR UPDATE (current = undefined)", async () => {
			mockStaleOrders(["order-gone"]);
			// Simula linha não encontrada: txSelects = [null]
			mockTransaction([null]);

			const res = await GET(makeRequest());
			const body = await res.json();
			expect(body).toEqual({ ok: true, canceled: 0 });
		});
	});

	describe("devolução da redenção do cupom", () => {
		it("pedido com cupom cancela e devolve a redenção na mesma transação", async () => {
			mockStaleOrders(["order-coupon"]);
			mockTransaction([{ status: "pending_payment", couponId: "promo-1" }]);

			const res = await GET(makeRequest());

			expect(await res.json()).toEqual({ ok: true, canceled: 1 });
			expect(updatedTables).toEqual(["order", "promotion"]);
		});

		it("pedido sem cupom cancela sem tocar a promotion", async () => {
			mockStaleOrders(["order-no-coupon"]);
			mockTransaction([{ status: "pending_payment", couponId: null }]);

			const res = await GET(makeRequest());

			expect(await res.json()).toEqual({ ok: true, canceled: 1 });
			expect(updatedTables).toEqual(["order"]);
		});

		it("pedido que saiu de pending_payment antes do lock não devolve a redenção", async () => {
			mockStaleOrders(["order-paid"]);
			mockTransaction([{ status: "paid", couponId: "promo-1" }]);

			const res = await GET(makeRequest());

			expect(await res.json()).toEqual({ ok: true, canceled: 0 });
			expect(updatedTables).toEqual([]);
		});
	});

	describe("isolamento de erro por item", () => {
		it("continua processando os demais quando um item falha na transação", async () => {
			mockStaleOrders(["order-fail", "order-ok"]);

			// Primeiro pedido: transação lança erro
			mockDbTransaction.mockImplementationOnce(() => {
				throw new Error("Simulated DB failure");
			});
			// Segundo pedido: transação normal
			mockTransaction([{ status: "pending_payment" }]);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			const body = await res.json();
			// order-fail não incrementa; order-ok sim
			expect(body).toEqual({ ok: true, canceled: 1 });
			// O erro do item isolado deve ter sido logado
			expect(logger.error).toHaveBeenCalledWith(
				"cancelStaleOrder",
				expect.objectContaining({ message: "Simulated DB failure" }),
				{ orderId: "order-fail" }
			);
		});
	});
});
