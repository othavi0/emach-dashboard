// packages/db/scripts/seed-demo.ts
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import { seedCatalog } from "./seed/catalog";
import { seedClients } from "./seed/clients";
import { emptyContext } from "./seed/context";
import { seedCore } from "./seed/core";
import { seedInventory } from "./seed/inventory";
import { seedMarketing } from "./seed/marketing";
import { seedSales } from "./seed/sales";
import { truncateDemo } from "./seed/truncate";

async function main() {
	// Lê os staff existentes (o seed nunca cria/trunca user).
	const staff = await db.execute<{ id: string }>(sql`SELECT id FROM "user"`);
	const staffUserIds = staff.rows.map((r) => r.id);
	if (staffUserIds.length === 0) {
		throw new Error(
			"Nenhum usuário staff na tabela `user`. Crie um (ou faça login) antes de rodar o seed."
		);
	}

	await db.transaction(async (tx) => {
		const ctx = emptyContext(staffUserIds);
		await truncateDemo(tx);
		await seedCore(tx, ctx);
		await seedCatalog(tx, ctx);
		await seedInventory(tx, ctx);
		await seedClients(tx, ctx);
		await seedSales(tx, ctx);
		await seedMarketing(tx, ctx);
	});
	console.log("[seed-demo] OK");
}

main()
	.catch((err) => {
		console.error("[seed-demo] FAIL", err);
		process.exit(1);
	})
	.then(() => process.exit(0));
