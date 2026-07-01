// packages/db/scripts/seed-demo.ts
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import { seedCartEvents } from "./seed/cart-events";
import { seedCatalog } from "./seed/catalog";
import { seedClients } from "./seed/clients";
import { emptyContext } from "./seed/context";
import { seedCore } from "./seed/core";
import { seedInventory } from "./seed/inventory";
import { seedMarketing } from "./seed/marketing";
import { seedSales } from "./seed/sales";
import { seedShipping } from "./seed/shipping";
import { truncateDemo } from "./seed/truncate";
import { verifySeed } from "./seed/verify";

async function main() {
	// GUARD: este seed TRUNCA 29 tabelas e repopula com mock. Não há banco de dev
	// separado — DATABASE_URL aponta para o MESMO Supabase de produção, então rodar
	// isto sem querer APAGA catálogo/clientes/pedidos reais. Exige opt-in explícito.
	const forced =
		process.argv.includes("--force") || process.env.SEED_FORCE === "1";
	if (!forced) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[seed-demo] ABORTADO.",
				"Este script TRUNCA 29 tabelas e repopula com dados de demonstração.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Não há ambiente de dev isolado — isto APAGA os dados reais.",
				"",
				"Se tem certeza, rode novamente com --force (ou SEED_FORCE=1).",
			].join("\n")
		);
		process.exit(1);
	}

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
		await seedCartEvents(tx, ctx);
		await seedMarketing(tx, ctx);
		await seedShipping(tx);
		await verifySeed(tx);
	});
	console.log("[seed-demo] OK");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[seed-demo] FAIL", err);
		process.exit(1);
	});
