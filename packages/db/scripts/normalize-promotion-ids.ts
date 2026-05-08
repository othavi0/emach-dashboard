import { env } from "@emach/env/server";
import { Client } from "pg";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
	const client = new Client({ connectionString: env.DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query<{ id: string; title: string }>(
			"SELECT id, title FROM promotion"
		);

		const toNormalize = rows.filter((r) => !UUID_RE.test(r.id));

		if (toNormalize.length === 0) {
			console.log("[normalize-promotion-ids] 0 promoções para normalizar");
			return;
		}

		console.log(
			`[normalize-promotion-ids] ${toNormalize.length} promoção(ões) para normalizar`
		);

		// FK promotion_tool.promotion_id pode estar como NOT DEFERRABLE em DBs
		// antigos. Aplicamos DEFERRABLE INITIALLY IMMEDIATE permanentemente para
		// permitir update pai+filho na mesma transação sem violação intermediária.
		// Comportamento default (immediate check) permanece para todas as outras
		// queries — só transações com SET CONSTRAINTS DEFERRED são afetadas.
		await client.query(
			"ALTER TABLE promotion_tool ALTER CONSTRAINT promotion_tool_promotion_id_promotion_id_fk DEFERRABLE INITIALLY IMMEDIATE"
		);

		await client.query("BEGIN");
		try {
			await client.query(
				"SET CONSTRAINTS promotion_tool_promotion_id_promotion_id_fk DEFERRED"
			);

			for (const row of toNormalize) {
				const newId = crypto.randomUUID();
				console.log(`  ${row.id} → ${newId}  (${row.title})`);

				await client.query("UPDATE promotion SET id = $1 WHERE id = $2", [
					newId,
					row.id,
				]);
				await client.query(
					"UPDATE promotion_tool SET promotion_id = $1 WHERE promotion_id = $2",
					[newId, row.id]
				);
			}

			await client.query("COMMIT");
			console.log("[normalize-promotion-ids] OK");
		} catch (err) {
			await client.query("ROLLBACK");
			throw err;
		}
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error("[normalize-promotion-ids] FAIL", err);
	process.exit(1);
});
