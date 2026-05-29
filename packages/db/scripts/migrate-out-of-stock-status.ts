import { sql } from "drizzle-orm";
import { db } from "../src/index";

async function main() {
	const res = await db.execute(
		sql`UPDATE "tool" SET status = 'active' WHERE status = 'out_of_stock'`
	);
	console.info(`tools migradas out_of_stock -> active: ${res.rowCount ?? 0}`);
	const [remaining] = (
		await db.execute<{ n: number }>(
			sql`SELECT COUNT(*)::int AS n FROM "tool" WHERE status = 'out_of_stock'`
		)
	).rows;
	if ((remaining?.n ?? 0) > 0) {
		throw new Error(`Ainda há ${remaining?.n} tools out_of_stock`);
	}
	console.info("OK: 0 tools out_of_stock restantes");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
