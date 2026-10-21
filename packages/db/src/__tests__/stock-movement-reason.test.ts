import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	STOCK_MOVEMENT_REASONS,
	type StockMovementReason,
	stockMovement,
} from "../schema/stock-movements";

const QUOTED = /'([^']*)'/g;

describe("CHECK stock_movement_reason_valid", () => {
	it("aceita exatamente os valores do union StockMovementReason", () => {
		const reasonCheck = getTableConfig(stockMovement).checks.find(
			(c) => c.name === "stock_movement_reason_valid"
		);

		if (!reasonCheck) {
			throw new Error("CHECK stock_movement_reason_valid ausente");
		}

		const checkSql = new PgDialect().sqlToQuery(reasonCheck.value).sql;

		const allowed = Array.from(checkSql.matchAll(QUOTED), (m) => m[1]).sort();

		expect(allowed).toEqual([...STOCK_MOVEMENT_REASONS].sort());
		expectTypeOf<
			(typeof STOCK_MOVEMENT_REASONS)[number]
		>().toEqualTypeOf<StockMovementReason>();
	});
});
