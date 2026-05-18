// packages/db/scripts/reset-demo.ts
import { db } from "../src/index";
import { truncateDemo } from "./seed/truncate";

async function main() {
	await db.transaction(async (tx) => {
		await truncateDemo(tx);
	});
	console.log(
		"[reset-demo] OK — tabelas demo truncadas (auth do dashboard intacta)"
	);
}

main()
	.catch((err) => {
		console.error("[reset-demo] FAIL", err);
		process.exit(1);
	})
	.then(() => process.exit(0));
