import { describe, expect, it, vi } from "vitest";
import type { AnyDb } from "../catalog-helpers";
import { getActivePromotions } from "../promotions";

// Stub db: devolve responses[][call] em sequência por chamada a execute.
// Cada elemento de responses é o array de rows para aquela chamada.
function makeDb(responses: unknown[][]): AnyDb {
	let call = 0;
	const execute = vi.fn().mockImplementation(() => {
		const rows = responses[call] ?? [];
		call++;
		return Promise.resolve({ rows });
	});
	return { execute } as unknown as AnyDb;
}

interface PromoStub {
	active: boolean;
	appliesToAll: boolean;
	code: null;
	createdAt: string;
	description: null;
	discountType: string;
	discountValue: string;
	endsAt: null;
	id: string;
	maxRedemptions: null;
	minOrderAmount: null;
	redemptionCount: number;
	startsAt: null;
	title: string;
	type: string;
	updatedAt: string;
}

function makePromo(id: string, appliesToAll: boolean): PromoStub {
	return {
		id,
		title: id,
		description: null,
		type: "promotion",
		code: null,
		discountType: "percent",
		discountValue: "10",
		appliesToAll,
		maxRedemptions: null,
		redemptionCount: 0,
		minOrderAmount: null,
		active: true,
		startsAt: null,
		endsAt: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

describe("getActivePromotions", () => {
	it("zero promos → retorna [] e emite 1 query", async () => {
		const db = makeDb([[]]); // promo SELECT retorna vazio
		const result = await getActivePromotions(db, 4);
		expect(result).toEqual([]);
		expect(db.execute).toHaveBeenCalledTimes(1);
	});

	it("applies_to_all → nenhuma query promotion_tool", async () => {
		const promo = makePromo("p1", true);
		const db = makeDb([
			[promo], // promo SELECT
			// sem promotion_tool batch (applies_to_all=true)
			[], // tool SELECT — retorna vazio
		]);
		const result = await getActivePromotions(db, 4);
		expect(result).toHaveLength(1);
		expect(result[0]?.tools).toEqual([]);
		// 1 promo SELECT + 1 tool SELECT (sem promotion_tool batch)
		expect(db.execute).toHaveBeenCalledTimes(2);
	});

	it("2 targeted promos → exatamente 1 batch de promotion_tool", async () => {
		const p1 = makePromo("p1", false);
		const p2 = makePromo("p2", false);
		const db = makeDb([
			[p1, p2], // promo SELECT
			[
				{ promotion_id: "p1", tool_id: "t1" },
				{ promotion_id: "p2", tool_id: "t2" },
			], // 1 único batch promotion_tool
			[], // tool SELECT p1
			[], // tool SELECT p2
		]);
		const result = await getActivePromotions(db, 4);
		expect(result).toHaveLength(2);
		// 1 promo SELECT + 1 promotion_tool batch + 2 tool SELECTs = 4
		expect(db.execute).toHaveBeenCalledTimes(4);
	});

	it("targeted sem linhas em promotion_tool → tools: [] sem tool SELECT", async () => {
		const promo = makePromo("p1", false);
		const db = makeDb([
			[promo], // promo SELECT
			[], // promotion_tool batch: sem linhas → promo inerte
			// sem tool SELECT (early return)
		]);
		const result = await getActivePromotions(db, 4);
		expect(result).toHaveLength(1);
		expect(result[0]?.tools).toEqual([]);
		// 1 promo SELECT + 1 promotion_tool batch = 2; sem tool SELECT
		expect(db.execute).toHaveBeenCalledTimes(2);
	});
});
