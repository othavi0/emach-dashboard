import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@emach/env/server";
import { Client } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));

// SQL canônico aplicado após o push do schema, em ordem. Todos idempotentes.
const SQL_FILES = ["triggers.sql", "rls.sql"];

async function main() {
	const client = new Client({ connectionString: env.DATABASE_URL });
	await client.connect();
	try {
		for (const file of SQL_FILES) {
			const sql = readFileSync(resolve(scriptDir, "../src/sql", file), "utf8");
			await client.query(sql);
			console.log(`[apply-sql] ${file} OK`);
		}
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error("[apply-sql] FAIL", err);
	process.exit(1);
});
