import { readFileSync } from "node:fs";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

const RLS_LINE =
	/^ALTER TABLE public\."?([a-z_]+)"? ENABLE ROW LEVEL SECURITY;$/gm;

const ALTER_LINE = /^ALTER TABLE/gm;

const rlsSql = readFileSync(new URL("../sql/rls.sql", import.meta.url), "utf8");
const rlsTables = Array.from(rlsSql.matchAll(RLS_LINE), (m) => m[1] ?? "");

async function schemaPgTables(): Promise<PgTable[]> {
	const schema = await import("../schema/index");

	return Object.values<unknown>(schema).filter((value): value is PgTable =>
		is(value, PgTable)
	);
}

async function schemaTables(): Promise<string[]> {
	return (await schemaPgTables()).map((table) => getTableName(table));
}

describe("rls.sql cobre todas as tabelas do schema public", () => {
	it("todo pgTable do schema tem ENABLE ROW LEVEL SECURITY no rls.sql", async () => {
		const rlsSet = new Set(rlsTables);

		const missing = (await schemaTables())
			.filter((name) => !rlsSet.has(name))
			.sort();

		expect(missing, "tabelas do schema sem linha no rls.sql").toEqual([]);
	});

	it("todo pgTable do schema declara .enableRLS()", async () => {
		const withoutRls = (await schemaPgTables())
			.filter((table) => !getTableConfig(table).enableRLS)
			.map((table) => getTableName(table))
			.sort();

		expect(
			withoutRls,
			"tabelas sem .enableRLS() no schema (o drizzle-kit push desliga o RLS delas)"
		).toEqual([]);
	});

	it("toda tabela do rls.sql existe no schema", async () => {
		const schemaSet = new Set(await schemaTables());
		const orphans = rlsTables.filter((name) => !schemaSet.has(name)).sort();

		expect(orphans, "linhas do rls.sql sem pgTable no schema").toEqual([]);
	});

	it("cada ALTER TABLE é uma linha de RLS e nenhuma tabela se repete", () => {
		const alterCount = rlsSql.match(ALTER_LINE)?.length ?? 0;

		const repeated = rlsTables
			.filter((name, i) => rlsTables.indexOf(name) !== i)
			.sort();

		expect(alterCount).toBe(rlsTables.length);
		expect(repeated, "tabelas repetidas no rls.sql").toEqual([]);
	});
});
