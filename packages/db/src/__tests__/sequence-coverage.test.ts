import { readFileSync } from "node:fs";
import { isPgSequence } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// O drizzle-kit push apaga toda sequence do banco que o schema não declara, e o
// apply-sql a recria do zero: o número do pedido voltaria a 1.
const CREATE_SEQUENCE = /CREATE SEQUENCE IF NOT EXISTS ([a-z_]+)/g;

const sqlFiles = ["triggers.sql", "rls.sql"];

const sqlSequences = sqlFiles.flatMap((file) =>
	Array.from(
		readFileSync(new URL(`../sql/${file}`, import.meta.url), "utf8").matchAll(
			CREATE_SEQUENCE
		),
		(m) => m[1] ?? ""
	)
);

async function schemaSequences(): Promise<string[]> {
	const schema = await import("../schema/index");

	return Object.values<unknown>(schema)
		.filter(isPgSequence)
		.map((sequence) => sequence.seqName ?? "");
}

describe("sequences criadas pelo SQL manual estão no schema", () => {
	it("o SQL manual cria ao menos uma sequence", () => {
		expect(sqlSequences).toContain("order_number_seq");
	});

	it("toda sequence do SQL manual é declarada com pgSequence", async () => {
		const declared = new Set(await schemaSequences());

		const missing = sqlSequences.filter((name) => !declared.has(name));

		expect(missing, `sequences fora do schema: ${missing.join(", ")}`).toEqual(
			[]
		);
	});
});
