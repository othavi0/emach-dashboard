import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("server-only", () => ({}));

vi.mock("@emach/db", () => ({
	db: { select: mockDbSelect },
	createDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
	getCurrentSession: vi.fn(),
}));

import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { getBranchTableAggregates } from "../data";

const dialect = new PgDialect();

describe("card de filiais conta estoque baixo pelo ponto de reposição (#442)", () => {
	let stockFields: Record<string, SQL> = {};

	beforeEach(() => {
		mockDbSelect.mockImplementation((fields: Record<string, SQL>) => ({
			from: (table: Table) => {
				if (getTableName(table) === "stock_level") {
					stockFields = fields;
				}

				return {
					where: () => ({
						groupBy: () =>
							Promise.resolve(
								getTableName(table) === "stock_level"
									? [{ branchId: "b1", active: 5, low: 2 }]
									: []
							),
					}),
				};
			},
		}));
	});

	it("filtra por reorder_point > 0 e quantity <= reorder_point, sem min_qty", async () => {
		const map = await getBranchTableAggregates(["b1"]);

		expect(map.get("b1")?.lowStock).toBe(2);

		const lowSql = stockFields.low
			? dialect.sqlToQuery(stockFields.low).sql
			: "";

		expect(lowSql).toContain('"stock_level"."reorder_point" > 0');
		expect(lowSql).toContain(
			'"stock_level"."quantity" <= "stock_level"."reorder_point"'
		);
		expect(lowSql).not.toContain("min_qty");
	});
});
