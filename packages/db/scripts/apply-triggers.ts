import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@emach/env/server";
import { Client } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));

async function main() {
	const sqlPath = resolve(scriptDir, "../src/sql/triggers.sql");
	const sql = readFileSync(sqlPath, "utf8");

	const client = new Client({ connectionString: env.DATABASE_URL });
	await client.connect();
	try {
		await client.query(sql);
		console.log("[apply-triggers] OK");
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error("[apply-triggers] FAIL", err);
	process.exit(1);
});
