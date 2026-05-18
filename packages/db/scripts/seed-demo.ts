// packages/db/scripts/seed-demo.ts
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import { emptyContext } from "./seed/context";
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
		// módulos adicionados nas Tasks 2-8
		void ctx;
	});
	console.log("[seed-demo] OK");
}

main()
	.catch((err) => {
		console.error("[seed-demo] FAIL", err);
		process.exit(1);
	})
	.then(() => process.exit(0));
