// packages/db/scripts/unseed-ready-to-ship.ts
// Desfaz seed-ready-to-ship.ts. Escopado pelo prefixo EM-TEST-91 e pela nota
// SEED_STOCK_NOTE — nunca toca em pedido ou estoque que não seja dele.
//
// Ordem importa: o estoque é devolvido ANTES de apagar os pedidos, porque as
// FKs de stock_movement pra order/order_item são `set null` (apagar o pedido
// primeiro apagaria a trilha que diz quanto devolver, deixando o saldo furado).

import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import { SEED_ORDER_PREFIX, SEED_STOCK_NOTE } from "./ready-to-ship-marks";

const ORDER_LIKE = `${SEED_ORDER_PREFIX}%`;

async function main() {
	const forced =
		process.argv.includes("--force") || process.env.SEED_FORCE === "1";
	if (!forced) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[unseed-ready-to-ship] ABORTADO.",
				`Apaga os pedidos ${SEED_ORDER_PREFIX}NN, devolve o estoque debitado`,
				"e remove a carga inicial criada pelo seed.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Se tem certeza, rode novamente com --force (ou SEED_FORCE=1).",
			].join("\n")
		);
		process.exit(1);
	}

	await db.transaction(async (tx) => {
		// 1. Devolve ao saldo cada unidade debitada pelos pedidos do seed.
		const restored = await tx.execute<{ variant_id: string; delta: number }>(
			sql`WITH sold AS (
					SELECT sm.variant_id, sm.branch_id, SUM(-sm.delta)::int AS qty
					FROM stock_movement sm
					JOIN "order" o ON o.id = sm.order_id
					WHERE o.number LIKE ${ORDER_LIKE}
						AND sm.reason = 'saida_venda'
						AND sm.variant_id IS NOT NULL
						AND sm.branch_id IS NOT NULL
					GROUP BY sm.variant_id, sm.branch_id
				)
				UPDATE stock_level sl
				SET quantity = sl.quantity + sold.qty
				FROM sold
				WHERE sl.variant_id = sold.variant_id AND sl.branch_id = sold.branch_id
				RETURNING sl.variant_id, sold.qty AS delta`
		);

		// 2. Apaga os pedidos. order_item / order_status_history / order_event /
		//    order_picking_item / order_picking_scan caem por CASCADE;
		//    order_picking é `restrict`, então sai antes, na mão.
		const orders = await tx.execute<{ id: string }>(
			sql`SELECT id FROM "order" WHERE number LIKE ${ORDER_LIKE}`
		);
		await tx.execute(
			sql`DELETE FROM order_picking
				WHERE order_id IN (SELECT id FROM "order" WHERE number LIKE ${ORDER_LIKE})`
		);
		// stock_movement.order_id é `set null`: as movimentações da venda
		// sobreviveriam órfãs no ledger. Apagadas aqui, já revertidas no passo 1.
		await tx.execute(
			sql`DELETE FROM stock_movement
				WHERE reason = 'saida_venda'
					AND order_id IN (SELECT id FROM "order" WHERE number LIKE ${ORDER_LIKE})`
		);
		await tx.execute(sql`DELETE FROM "order" WHERE number LIKE ${ORDER_LIKE}`);

		// 3. Remove a carga inicial: só os stock_level que o seed criou, e só se
		//    o saldo tiver voltado ao valor carregado (qualquer movimento alheio
		//    no meio faz o registro ficar de pé, pra não destruir dado de outro).
		const loads = await tx.execute<{
			branch_id: string;
			new_qty: number;
			variant_id: string;
		}>(
			sql`SELECT variant_id, branch_id, new_qty
				FROM stock_movement
				WHERE reason = 'ajuste_inventario' AND reason_note = ${SEED_STOCK_NOTE}
					AND variant_id IS NOT NULL AND branch_id IS NOT NULL`
		);

		let stockRemoved = 0;
		const stockKept: string[] = [];
		for (const load of loads.rows) {
			const deleted = await tx.execute<{ variant_id: string }>(
				sql`DELETE FROM stock_level
					WHERE variant_id = ${load.variant_id}
						AND branch_id = ${load.branch_id}
						AND quantity = ${load.new_qty}
					RETURNING variant_id`
			);
			if (deleted.rows.length > 0) {
				stockRemoved += 1;
			} else {
				stockKept.push(load.variant_id);
			}
		}

		await tx.execute(
			sql`DELETE FROM stock_movement
				WHERE reason = 'ajuste_inventario' AND reason_note = ${SEED_STOCK_NOTE}`
		);

		console.log(
			[
				`[unseed-ready-to-ship] OK — pedidos apagados: ${orders.rows.length}`,
				`estoque devolvido: ${restored.rows.length} variante(s)`,
				`stock_level removidos: ${stockRemoved}`,
				stockKept.length > 0
					? `stock_level mantidos (saldo divergente, houve movimento alheio): ${stockKept.join(", ")}`
					: null,
			]
				.filter(Boolean)
				.join("\n")
		);
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[unseed-ready-to-ship] FAIL", err);
		process.exit(1);
	});
