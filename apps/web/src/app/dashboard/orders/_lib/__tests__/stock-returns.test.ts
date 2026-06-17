import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyStockReturns, type ReturnItemInput } from "../stock-returns";

// ---------------------------------------------------------------------------
// Mock manual do `tx` do Drizzle.
// applyStockReturns recebe `tx` como argumento — não importa @emach/db,
// então vi.mock("@emach/db") não é necessário.
// ---------------------------------------------------------------------------

function makeTx(
	/**
	 * Resultados que .select().from().where()[.for()] vai resolver, em ordem de
	 * chamada. O primeiro call é o SELECT de orderItem; o segundo é o SELECT de
	 * stockLevel. Para itens desconhecidos (skip), passe [] como primeiro item.
	 */
	selectResults: unknown[][]
) {
	let callIdx = 0;

	// Builder de SELECT: encadeia .from/.where/.for e resolve ao final.
	const makeSelectChain = (result: unknown[]) => {
		const chain = {
			from: () => chain,
			where: () => chain,
			for: () => Promise.resolve(result),
			// sem .for() o vitest vai awaitar o objeto chain — então também precisamos
			// que o chain seja thenable quando não há .for()
			// biome-ignore lint/suspicious/noThenProperty: mock intencional do query builder thenable do Drizzle
			then: (resolve: (v: unknown[]) => void, _reject?: (e: unknown) => void) =>
				Promise.resolve(result).then(resolve, _reject),
		};
		return chain;
	};

	const insertValues = vi.fn().mockResolvedValue(undefined);
	const insertOnConflict = vi.fn().mockResolvedValue(undefined);

	const makeInsertChain = () => ({
		values: (data: unknown) => {
			insertValues(data);
			return {
				onConflictDoUpdate: (opts: unknown) => {
					insertOnConflict(opts);
					return Promise.resolve(undefined);
				},
				// INSERT sem onConflictDoUpdate também é thenable
				// biome-ignore lint/suspicious/noThenProperty: mock intencional do query builder thenable do Drizzle
				then: (
					resolve: (v: undefined) => void,
					_reject?: (e: unknown) => void
				) => Promise.resolve(undefined).then(resolve, _reject),
			};
		},
	});

	const tx = {
		select: vi.fn((_shape: unknown) => {
			const result = selectResults[callIdx++] ?? [];
			return makeSelectChain(result);
		}),
		insert: vi.fn((_table: unknown) => makeInsertChain()),
		// expor para assertions
		_insertValues: insertValues,
		_insertOnConflict: insertOnConflict,
	};

	return tx;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "order-abc";
const USER_ID = "user-xyz";
const REASON_NOTE = "Devolução ao estoque — pedido devolvido";

const ITEM_INPUT: ReturnItemInput = {
	branchId: "branch-1",
	orderItemId: "oi-1",
};

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("applyStockReturns", () => {
	beforeEach(() => {
		// Limpar o spy global de crypto.randomUUID entre testes para não vazar estado.
		vi.restoreAllMocks();
	});

	it("(1) retorno normal: credita stock_level e insere stock_movement com delta positivo", async () => {
		// SELECT orderItem → 1 item com quantity=2, variantId="var-1"
		// SELECT stockLevel → 1 registro com quantity=10
		const tx = makeTx([
			[{ quantity: 2, variantId: "var-1" }], // orderItem
			[{ quantity: 10 }], // stockLevel
		]);

		vi.spyOn(crypto, "randomUUID").mockReturnValue(
			"mock-uuid-1" as ReturnType<typeof crypto.randomUUID>
		);

		await applyStockReturns(
			tx as unknown as Parameters<typeof applyStockReturns>[0],
			ORDER_ID,
			[ITEM_INPUT],
			USER_ID,
			REASON_NOTE
		);

		// Deve ter feito 2 SELECTs
		expect(tx.select).toHaveBeenCalledTimes(2);

		// INSERT em stockLevel (upsert)
		const stockLevelInsertArg = tx._insertValues.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(stockLevelInsertArg).toMatchObject({
			variantId: "var-1",
			branchId: "branch-1",
			quantity: 12, // 10 anterior + 2 devolvidos
		});
		expect(tx._insertOnConflict).toHaveBeenCalledOnce();

		// INSERT em stockMovement
		const movementArg = tx._insertValues.mock.calls[1]?.[0] as Record<
			string,
			unknown
		>;
		expect(movementArg).toMatchObject({
			id: "mock-uuid-1",
			variantId: "var-1",
			branchId: "branch-1",
			previousQty: 10,
			newQty: 12,
			delta: 2,
			reason: "ajuste_inventario",
			reasonNote: REASON_NOTE,
			orderId: ORDER_ID,
			orderItemId: ITEM_INPUT.orderItemId,
			actorType: "user",
			actorId: USER_ID,
		});
	});

	it("(2) orderItem desconhecido: pulado sem erro, sem INSERT", async () => {
		// SELECT orderItem → vazio (item não pertence a este pedido)
		const tx = makeTx([
			[], // orderItem não encontrado
		]);

		await expect(
			applyStockReturns(
				tx as unknown as Parameters<typeof applyStockReturns>[0],
				ORDER_ID,
				[ITEM_INPUT],
				USER_ID,
				REASON_NOTE
			)
		).resolves.toBeUndefined();

		// Apenas 1 SELECT (orderItem) — não chega ao SELECT de stockLevel
		expect(tx.select).toHaveBeenCalledTimes(1);
		// Nenhum INSERT
		expect(tx.insert).not.toHaveBeenCalled();
	});

	it("(3) 2 itens: 2 movimentos de estoque inseridos", async () => {
		const item2: ReturnItemInput = {
			branchId: "branch-2",
			orderItemId: "oi-2",
		};

		// Por item: SELECT orderItem, SELECT stockLevel — 4 SELECTs no total
		const tx = makeTx([
			[{ quantity: 3, variantId: "var-1" }], // orderItem item 1
			[{ quantity: 5 }], // stockLevel item 1
			[{ quantity: 1, variantId: "var-2" }], // orderItem item 2
			[], // stockLevel item 2 — não existe ainda (previousQty=0)
		]);

		await applyStockReturns(
			tx as unknown as Parameters<typeof applyStockReturns>[0],
			ORDER_ID,
			[ITEM_INPUT, item2],
			USER_ID,
			REASON_NOTE
		);

		expect(tx.select).toHaveBeenCalledTimes(4);
		// 2 upserts em stockLevel + 2 inserts em stockMovement = 4 calls a insertValues
		expect(tx._insertValues).toHaveBeenCalledTimes(4);

		// Verificar o movimento do item 2 especificamente (previousQty=0, newQty=1)
		const movement2 = tx._insertValues.mock.calls[3]?.[0] as Record<
			string,
			unknown
		>;
		expect(movement2).toMatchObject({
			variantId: "var-2",
			branchId: "branch-2",
			previousQty: 0,
			newQty: 1,
			delta: 1,
			orderId: ORDER_ID,
			orderItemId: item2.orderItemId,
		});
	});
});
