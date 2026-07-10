// packages/db/scripts/seed-test-orders.ts
// Seed INSERT-ONLY de 5 pedidos pagos pra teste da listagem (spec 2026-07-10).
// Diferente do seed-demo: NÃO trunca nada; reusa clients/branches/variants reais.
// Única operação não-INSERT: decremento escopado de stock_level (espelha o
// débito que o ecommerce faz ao confirmar pagamento).

import { order, orderItem, orderStatusHistory } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import type { Tx } from "./seed/context";

const HOURS = 3_600_000;
// Idades desde o pagamento: 2h e 26h (normais), 50h (âmbar), 74h e 120h (Atrasados).
const PAID_AGES_HOURS = [2, 26, 50, 74, 120] as const;
const SHIPPING_METHODS = ["SEDEX", "PAC", null, "SEDEX", "PAC"] as const;

interface ClientRow {
	id: string;
	name: string;
}
interface VariantRow {
	cest: string | null;
	manufacturer_name: string | null;
	model: string | null;
	name: string;
	ncm: string | null;
	price_amount: string;
	sku: string | null;
	stock_qty: number;
	tool_id: string;
	variant_id: string;
	voltage: string | null;
}

async function insertTestOrderLine(
	tx: Tx,
	params: {
		branchId: string;
		line: { v: VariantRow; quantity: number };
		orderId: string;
	}
): Promise<void> {
	const { branchId, line, orderId } = params;
	const itemId = crypto.randomUUID();
	await tx.insert(orderItem).values({
		id: itemId,
		orderId,
		toolId: line.v.tool_id,
		variantId: line.v.variant_id,
		sku: line.v.sku,
		name: line.v.name,
		model: line.v.model,
		voltage: line.v.voltage,
		unitPrice: line.v.price_amount,
		quantity: line.quantity,
		lineTotal: (line.quantity * Number.parseFloat(line.v.price_amount)).toFixed(
			2
		),
		discountAmount: "0",
		ncm: line.v.ncm,
		cest: line.v.cest,
		manufacturerName: line.v.manufacturer_name,
	});

	// Débito de estoque — espelha o ecommerce na confirmação de pagamento.
	const current = await tx.execute<{ quantity: number }>(
		sql`SELECT quantity FROM stock_level WHERE variant_id = ${line.v.variant_id} AND branch_id = ${branchId}`
	);
	const currentQty = current.rows[0]?.quantity;
	if (currentQty === undefined || currentQty < line.quantity) {
		throw new Error(
			`[seed-test-orders] estoque insuficiente variant=${line.v.variant_id}`
		);
	}
	const newQty = currentQty - line.quantity;
	await tx.insert(stockMovement).values({
		id: crypto.randomUUID(),
		variantId: line.v.variant_id,
		branchId,
		previousQty: currentQty,
		newQty,
		delta: -line.quantity,
		reason: "saida_venda",
		reasonNote: null,
		orderId,
		orderItemId: itemId,
		actorType: "system",
		actorId: null,
	});
	await tx.execute(
		sql`UPDATE stock_level SET quantity = ${newQty} WHERE variant_id = ${line.v.variant_id} AND branch_id = ${branchId}`
	);
}

async function insertTestOrder(
	tx: Tx,
	params: {
		ageHours: number;
		branchId: string;
		client: ClientRow;
		index: number;
		variantPool: VariantRow[];
	}
): Promise<string> {
	const { ageHours, branchId, client, index, variantPool } = params;
	const orderId = crypto.randomUUID();
	const number = `EM-TEST-${9001 + index}`;
	const paidAt = new Date(Date.now() - ageHours * HOURS);
	const createdAt = new Date(paidAt.getTime() - 3 * HOURS);
	// 1 a 4 itens por pedido, girando pelo pool de variantes.
	const lineCount = (index % 4) + 1;
	const lines = Array.from({ length: lineCount }, (_, j) => {
		const v = variantPool[(index * 2 + j) % variantPool.length];
		if (!v) {
			throw new Error("[seed-test-orders] variant index fora do range.");
		}
		return { v, quantity: (j % 3) + 1 };
	});

	const subtotal = lines
		.reduce(
			(sum, l) => sum + l.quantity * Number.parseFloat(l.v.price_amount),
			0
		)
		.toFixed(2);
	const shippingAmount = SHIPPING_METHODS[index] ? "39.90" : "0";
	const totalAmount = (
		Number.parseFloat(subtotal) + Number.parseFloat(shippingAmount)
	).toFixed(2);

	await tx.insert(order).values({
		id: orderId,
		number,
		clientId: client.id,
		branchId,
		status: "paid",
		paymentMethod: "pix",
		paymentProviderRef: `TEST-${orderId.slice(0, 8).toUpperCase()}`,
		subtotalAmount: subtotal,
		discountAmount: "0",
		shippingAmount,
		totalAmount,
		shippingAddress: {
			recipient: client.name,
			zipCode: "13010-000",
			street: "Rua de Teste",
			number: String(100 + index),
			neighborhood: "Centro",
			city: "Campinas",
			state: "SP",
			country: "BR",
		},
		shippingMethod: SHIPPING_METHODS[index],
		shippingTrackingCode: null,
		notes: null,
		createdAt,
		paidAt,
	});

	for (const line of lines) {
		await insertTestOrderLine(tx, { branchId, line, orderId });
	}

	// Histórico coerente: criado → pago (gateway = system; CHECK actor_coherence).
	await tx.insert(orderStatusHistory).values({
		id: crypto.randomUUID(),
		orderId,
		fromStatus: "pending_payment",
		toStatus: "pending_payment",
		actorType: "system",
		actorUserId: null,
		reason: "criado",
		createdAt,
	});
	await tx.insert(orderStatusHistory).values({
		id: crypto.randomUUID(),
		orderId,
		fromStatus: "pending_payment",
		toStatus: "paid",
		actorType: "system",
		actorUserId: null,
		reason: null,
		createdAt: paidAt,
	});

	return number;
}

async function main() {
	const forced =
		process.argv.includes("--force") || process.env.SEED_FORCE === "1";
	if (!forced) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[seed-test-orders] ABORTADO.",
				"Insere 5 pedidos pagos de teste (EM-TEST-90NN) com débito de estoque.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Se tem certeza, rode novamente com --force (ou SEED_FORCE=1).",
			].join("\n")
		);
		process.exit(1);
	}

	await db.transaction(async (tx) => {
		// FKs reais — aborta com erro claro se faltar base (nunca fabrica catálogo).
		const branches = await tx.execute<{ id: string }>(
			sql`SELECT id FROM branch WHERE status = 'active' ORDER BY created_at LIMIT 1`
		);
		const branchId = branches.rows[0]?.id;
		if (!branchId) {
			throw new Error("[seed-test-orders] nenhuma branch ativa.");
		}

		// Tipos inline (não `ClientRow`/`VariantRow`): `db.execute<T>` exige T
		// assinável a `Record<string, unknown>`, satisfeito por type literal
		// mas não por `interface` (sem index signature implícito) — as
		// interfaces nomeadas seguem usadas nas assinaturas dos helpers abaixo.
		const clients = await tx.execute<{ id: string; name: string }>(
			sql`SELECT id, name FROM client WHERE status = 'active' ORDER BY created_at LIMIT 5`
		);
		if (clients.rows.length === 0) {
			throw new Error("[seed-test-orders] nenhum client ativo.");
		}

		const variants = await tx.execute<{
			variant_id: string;
			tool_id: string;
			sku: string | null;
			price_amount: string;
			name: string;
			model: string | null;
			voltage: string | null;
			ncm: string | null;
			cest: string | null;
			manufacturer_name: string | null;
			stock_qty: number;
		}>(sql`
			SELECT tv.id AS variant_id, tv.tool_id, tv.sku, tv.price_amount, tv.voltage,
				t.name, t.model, t.ncm, t.cest, t.manufacturer_name,
				sl.quantity AS stock_qty
			FROM tool_variant tv
			JOIN tool t ON t.id = tv.tool_id AND t.status = 'active'
			JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${branchId}
			WHERE sl.quantity >= 5
			ORDER BY t.name
			LIMIT 12
		`);
		if (variants.rows.length < 4) {
			throw new Error(
				"[seed-test-orders] menos de 4 variantes ativas com estoque ≥5 na branch."
			);
		}

		const createdNumbers: string[] = [];

		for (const [index, ageHours] of PAID_AGES_HOURS.entries()) {
			const client = clients.rows[index % clients.rows.length];
			if (!client) {
				throw new Error("[seed-test-orders] client index fora do range.");
			}
			const number = await insertTestOrder(tx, {
				ageHours,
				branchId,
				client,
				index,
				variantPool: variants.rows,
			});
			createdNumbers.push(number);
		}

		console.log(
			`[seed-test-orders] OK — criados: ${createdNumbers.join(", ")}\n` +
				"Limpeza manual: DELETE FROM \"order\" WHERE number LIKE 'EM-TEST-%' " +
				"(order_item/history caem por CASCADE; stock_movement/stock_level exigem reversão manual)."
		);
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[seed-test-orders] FAIL", err);
		process.exit(1);
	});
