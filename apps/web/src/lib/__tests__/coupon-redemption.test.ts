import { promotion } from "@emach/db/schema/promotions";
import type { SQL, Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { releaseCouponRedemption } from "../coupon-redemption";

const dialect = new PgDialect();

type ReleaseTx = Parameters<typeof releaseCouponRedemption>[0];

interface RecordedUpdate {
	redemptionCount: SQL;
	table: Table;
	where: SQL;
}

function makeRecordingTx() {
	const updates: RecordedUpdate[] = [];

	const stub = {
		update: vi.fn((table: Table) => ({
			set: (values: { redemptionCount: SQL }) => ({
				where: (where: SQL) => {
					updates.push({
						table,
						redemptionCount: values.redemptionCount,
						where,
					});

					return Promise.resolve();
				},
			}),
		})),
	};

	return { tx: asReleaseTx(stub), updates };
}

function asReleaseTx(stub: Pick<ReleaseTx, never>): ReleaseTx {
	// SAFETY: releaseCouponRedemption só chama tx.update(...).set(...).where(...),
	// e o stub implementa essa cadeia; outro método falha o teste com TypeError.
	return stub as ReleaseTx;
}

describe("releaseCouponRedemption", () => {
	it("devolve uma redenção do cupom sem deixar o contador negativo", async () => {
		const { tx, updates } = makeRecordingTx();

		await releaseCouponRedemption(tx, "promo-1");

		expect(updates).toHaveLength(1);

		const [update] = updates;

		expect(update?.table).toBe(promotion);
		expect(update && dialect.sqlToQuery(update.redemptionCount)).toMatchObject({
			sql: 'GREATEST("promotion"."redemption_count" - 1, 0)',
			params: [],
		});
		expect(update && dialect.sqlToQuery(update.where)).toMatchObject({
			sql: '"promotion"."id" = $1',
			params: ["promo-1"],
		});
	});

	it("pedido sem cupom não toca a promotion", async () => {
		const { tx, updates } = makeRecordingTx();

		await releaseCouponRedemption(tx, null);

		expect(updates).toEqual([]);
	});
});
