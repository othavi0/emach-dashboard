import { describe, expect, it } from "vitest";

import { getPgError } from "./db-error";

describe("getPgError", () => {
	it("extrai o erro do Postgres da cadeia .cause (wrapper do drizzle)", () => {
		// Formato real do drizzle 0.45.x: DrizzleQueryError com a DatabaseError em .cause
		const drizzleError = {
			name: "DrizzleQueryError",
			message: 'Failed query: delete from "category" where "id" = $1',
			cause: {
				name: "DatabaseError",
				code: "23503",
				message:
					'update or delete on table "category" violates foreign key constraint "attribute_definition_category_id_category_id_fk"',
				constraint: "attribute_definition_category_id_category_id_fk",
			},
		};
		const pg = getPgError(drizzleError);
		expect(pg?.code).toBe("23503");
		expect(pg?.constraint).toBe(
			"attribute_definition_category_id_category_id_fk"
		);
		expect(pg?.message).toContain("foreign key constraint");
	});

	it("encontra o code no próprio erro (sem wrapper)", () => {
		const pg = getPgError({ code: "23505", message: "duplicate key" });
		expect(pg?.code).toBe("23505");
	});

	it("devolve null quando não há erro pg na cadeia", () => {
		expect(getPgError(new Error("erro comum"))).toBeNull();
		expect(getPgError("string solta")).toBeNull();
		expect(getPgError(null)).toBeNull();
	});

	it("não entra em loop com cadeia .cause circular", () => {
		const a: { cause?: unknown } = {};
		a.cause = a;
		expect(getPgError(a)).toBeNull();
	});
});
