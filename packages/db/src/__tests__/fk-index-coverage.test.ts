import { getTableName, is } from "drizzle-orm";
import {
	foreignKey,
	getTableConfig,
	index,
	PgTable,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// Uma FK está coberta quando algum índice, unique ou PK começa pelas colunas
// dela, na mesma ordem. Sem isso, o DELETE no pai varre a tabela filha inteira.
function uncoveredForeignKeys(exported: readonly unknown[]): string[] {
	const missing: string[] = [];

	for (const table of exported) {
		if (!is(table, PgTable)) {
			continue;
		}

		const config = getTableConfig(table);

		const leading: string[][] = [
			...config.indexes.map((i) =>
				i.config.columns.map((c) => ("name" in c ? c.name : ""))
			),
			...config.uniqueConstraints.map((u) => u.columns.map((c) => c.name)),
			...config.primaryKeys.map((pk) => pk.columns.map((c) => c.name)),
			...config.columns
				.filter((c) => c.primary || c.isUnique)
				.map((c) => [c.name]),
		];

		for (const fk of config.foreignKeys) {
			const columns = fk.reference().columns.map((c) => c.name);

			const covered = leading.some((cols) =>
				columns.every((name, i) => cols[i] === name)
			);

			if (!covered) {
				missing.push(`${getTableName(table)}.${columns.join(",")}`);
			}
		}
	}

	return missing.sort();
}

const parent = pgTable("fk_parent", { id: text("id").primaryKey() });

describe("toda FK do schema tem índice que começa pelas colunas dela", () => {
	it("nenhuma FK do schema fica sem índice", async () => {
		const schema = await import("../schema/index");

		expect(
			uncoveredForeignKeys(Object.values(schema)),
			"FKs sem índice que comece pelas colunas delas"
		).toEqual([]);
	});

	it("acusa FK sem índice e aceita índice, PK composta e índice que só a tem no fim", () => {
		const columns = {
			id: text("id").primaryKey(),
			parentId: text("parent_id").references(() => parent.id),
			otherId: text("other_id"),
		};

		const semIndice = pgTable("fk_sem_indice", columns);

		const comIndice = pgTable("fk_com_indice", columns, (table) => [
			index("fk_com_indice_parent_idx").on(table.parentId, table.otherId),
		]);

		const indiceNoFim = pgTable("fk_indice_no_fim", columns, (table) => [
			index("fk_indice_no_fim_idx").on(table.otherId, table.parentId),
		]);

		const composta = pgTable(
			"fk_composta",
			{ a: text("a").notNull(), b: text("b").notNull() },
			(table) => [
				foreignKey({
					columns: [table.a, table.b],
					foreignColumns: [table.a, table.b],
					name: "fk_composta_self_fk",
				}),
				index("fk_composta_b_a_idx").on(table.b, table.a),
			]
		);

		expect(
			uncoveredForeignKeys([semIndice, comIndice, indiceNoFim, composta])
		).toEqual([
			"fk_composta.a,b",
			"fk_indice_no_fim.parent_id",
			"fk_sem_indice.parent_id",
		]);
	});
});
