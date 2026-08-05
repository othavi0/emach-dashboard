// packages/db/scripts/seed-ready-to-ship.ts
// Seed INSERT-ONLY de 5 pedidos "Pronto para enviar" (preparing + separação
// concluída) pra teste da aba Separado. Irmão do seed-test-orders.ts, que para
// em `paid`.
//
// "Pronto para enviar" NÃO é um valor do enum order_status: é o sub-estado
// derivado `picked` = status 'preparing' + última order_picking com status
// 'completed' (ver apps/web/.../separacao/fulfillment-meta.ts). Por isso o
// script escreve a cadeia inteira que a app escreveria — order, itens,
// histórico, evento de filial, débito de estoque, sessão de separação, itens
// bipados e os scans.
//
// NÃO trunca nada; reusa client/branch/variants reais. Operações não-INSERT:
// upsert de stock_level (carga inicial) e decremento escopado no débito da
// venda — ambas revertidas por unseed-ready-to-ship.ts.

import { branch } from "@emach/db/schema/inventory";
import {
	order,
	orderEvent,
	orderItem,
	orderPicking,
	orderPickingItem,
	orderPickingScan,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { db } from "../src/index";
import { SEED_ORDER_PREFIX, SEED_STOCK_NOTE } from "./ready-to-ship-marks";
import type { Tx } from "./seed/context";

const MINUTES = 60_000;
const HOURS = 3_600_000;

/** Saldo inicial por SKU na filial, antes do débito das vendas. */
const INITIAL_STOCK_QTY = 50;

/**
 * Composição dos 5 pedidos, explícita em vez de algorítmica: o catálogo tem
 * apenas 4 SKUs, então a variação pedida ("de 1 a 5 ferramentas") vem do nº de
 * linhas somado à quantidade por linha. Chaveado por SKU (não por índice) pra
 * a tabela ser conferível a olho.
 *
 * `shippingMethod` NUNCA é null: o app renderiza `shipping_method IS NULL` como
 * "A combinar" (order-card.tsx), estado que a operação não usa — pedido de
 * teste não deve nascer nele. Só PAC e SEDEX.
 */
const ORDER_SPECS = [
	{
		suffix: "01",
		lines: [{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR1", quantity: 1 }],
		shippingMethod: "PAC",
		shippingAmount: "24.90",
		paymentMethod: "pix",
		preparingAgeHours: 2,
	},
	{
		suffix: "02",
		lines: [
			{ sku: "OPCAO-1", quantity: 2 },
			{ sku: "OPCAO-2", quantity: 1 },
		],
		shippingMethod: "SEDEX",
		shippingAmount: "39.90",
		paymentMethod: "credit_card",
		preparingAgeHours: 7,
	},
	{
		suffix: "03",
		lines: [
			{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR1", quantity: 1 },
			{ sku: "OPCAO-1", quantity: 1 },
			{ sku: "OPCAO-2", quantity: 2 },
		],
		shippingMethod: "PAC",
		shippingAmount: "24.90",
		paymentMethod: "pix",
		preparingAgeHours: 14,
	},
	{
		suffix: "04",
		lines: [
			{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR1", quantity: 1 },
			{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR2", quantity: 1 },
			{ sku: "OPCAO-1", quantity: 1 },
			{ sku: "OPCAO-2", quantity: 1 },
		],
		shippingMethod: "SEDEX",
		shippingAmount: "39.90",
		paymentMethod: "boleto",
		preparingAgeHours: 22,
	},
	{
		suffix: "05",
		lines: [
			{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR1", quantity: 2 },
			{ sku: "DESEMPENADEIRA-ELTRICA-1100W-EDP-1100BR2", quantity: 1 },
			{ sku: "OPCAO-1", quantity: 1 },
			{ sku: "OPCAO-2", quantity: 1 },
		],
		shippingMethod: "PAC",
		shippingAmount: "24.90",
		paymentMethod: "pix",
		preparingAgeHours: 29,
	},
] as const;

// Sem cupom neste seed — constante única referenciada por `order.discountAmount`
// e pela fórmula de `totalAmount`, pra invariante
// subtotal − desconto + frete = total não quebrar em silêncio.
const DISCOUNT_AMOUNT = "0";

// Usada nas assinaturas dos helpers. A query correspondente em `loadBase`
// repete o shape como type literal inline: `db.execute<T>` exige T assinável a
// `Record<string, unknown>`, satisfeito por type literal mas não por interface
// (sem index signature implícito) — mesmo motivo documentado em
// seed-test-orders.ts.
interface VariantRow {
	barcode: string | null;
	cest: string | null;
	height_cm: string | null;
	length_cm: string | null;
	manufacturer_name: string | null;
	model: string | null;
	name: string;
	ncm: string | null;
	price_amount: string;
	sku: string;
	tool_id: string;
	variant_id: string;
	voltage: string | null;
	weight_kg: string | null;
	width_cm: string | null;
}

interface PickerRow {
	id: string;
	name: string;
}

interface AddressRow {
	city: string;
	complement: string | null;
	neighborhood: string;
	number: string;
	recipient: string;
	state: string;
	street: string;
	zip_code: string;
}

/** CEP só-dígitos → 00000-000 (o snapshot é campo de exibição, não de cálculo). */
function formatCep(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : raw;
}

/**
 * Carga inicial de estoque na filial, idempotente. Só cria o que falta: um
 * stock_level preexistente é deixado como está (não é nosso pra reverter). Cada
 * criação gera um stock_movement 'ajuste_inventario' marcado com
 * SEED_STOCK_NOTE — é por ele que o unseed sabe o que apagar.
 */
async function ensureStock(
	tx: Tx,
	params: { branchId: string; variants: VariantRow[] }
): Promise<number> {
	const { branchId, variants } = params;
	let created = 0;

	for (const v of variants) {
		const inserted = await tx.execute<{ variant_id: string }>(
			sql`INSERT INTO stock_level (variant_id, branch_id, quantity, min_qty, reorder_point)
				VALUES (${v.variant_id}, ${branchId}, ${INITIAL_STOCK_QTY}, 0, 0)
				ON CONFLICT (variant_id, branch_id) DO NOTHING
				RETURNING variant_id`
		);
		if (inserted.rows.length === 0) {
			continue;
		}
		created += 1;
		await tx.insert(stockMovement).values({
			id: crypto.randomUUID(),
			variantId: v.variant_id,
			branchId,
			previousQty: 0,
			newQty: INITIAL_STOCK_QTY,
			delta: INITIAL_STOCK_QTY,
			reason: "ajuste_inventario",
			reasonNote: SEED_STOCK_NOTE,
			actorType: "system",
			actorId: null,
		});
	}

	return created;
}

interface ResolvedLine {
	quantity: number;
	v: VariantRow;
}

/**
 * Débito de estoque + linha do pedido. Espelha o ecommerce na confirmação de
 * pagamento: UPDATE relativo numa operação só (sem SELECT prévio) elimina o
 * lost-update contra tráfego concorrente, e roda ANTES do insert do item — se
 * o saldo for insuficiente, aborta sem deixar orderItem/stockMovement órfãos.
 */
async function insertOrderLine(
	tx: Tx,
	params: { branchId: string; line: ResolvedLine; orderId: string }
): Promise<string> {
	const { branchId, line, orderId } = params;
	const itemId = crypto.randomUUID();

	const debited = await tx.execute<{ quantity: number }>(
		sql`UPDATE stock_level
			SET quantity = quantity - ${line.quantity}
			WHERE variant_id = ${line.v.variant_id}
				AND branch_id = ${branchId}
				AND quantity >= ${line.quantity}
			RETURNING quantity`
	);
	const newQty = debited.rows[0]?.quantity;
	if (newQty === undefined) {
		throw new Error(
			`[seed-ready-to-ship] estoque insuficiente ou stock_level ausente: variant=${line.v.variant_id} branch=${branchId}`
		);
	}

	await tx.insert(orderItem).values({
		id: itemId,
		orderId,
		toolId: line.v.tool_id,
		variantId: line.v.variant_id,
		sku: line.v.sku,
		barcode: line.v.barcode,
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
		weightKg: line.v.weight_kg,
		lengthCm: line.v.length_cm,
		widthCm: line.v.width_cm,
		heightCm: line.v.height_cm,
	});

	// stock_movement.order_item_id referencia orderItem.id — insert depois do item.
	await tx.insert(stockMovement).values({
		id: crypto.randomUUID(),
		variantId: line.v.variant_id,
		branchId,
		previousQty: newQty + line.quantity,
		newQty,
		delta: -line.quantity,
		reason: "saida_venda",
		reasonNote: null,
		orderId,
		orderItemId: itemId,
		actorType: "system",
		actorId: null,
	});

	return itemId;
}

/**
 * Sessão de separação já concluída: itens com qtyPicked = qtyExpected e um scan
 * por unidade, com o barcode real da variante. Reproduz o que
 * startPicking → scanItem ×N → completePicking deixaria no banco, incluindo o
 * variantSnapshot (fonte do barcode na tela de bipe).
 */
async function insertCompletedPicking(
	tx: Tx,
	params: {
		branchId: string;
		itemIds: string[];
		lines: readonly ResolvedLine[];
		orderId: string;
		picker: PickerRow;
		startedAt: Date;
	}
): Promise<void> {
	const { branchId, itemIds, lines, orderId, picker, startedAt } = params;
	const pickingId = crypto.randomUUID();
	const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
	// ~90s por unidade bipada — duração plausível de uma separação real.
	const completedAt = new Date(
		startedAt.getTime() + totalUnits * 1.5 * MINUTES
	);

	await tx.insert(orderPicking).values({
		id: pickingId,
		orderId,
		branchId,
		status: "completed",
		pickerUserId: picker.id,
		pickerName: picker.name,
		startedAt,
		completedAt,
	});

	let scanCursor = startedAt.getTime();

	for (const [index, line] of lines.entries()) {
		const orderItemId = itemIds[index];
		if (!orderItemId) {
			throw new Error("[seed-ready-to-ship] order_item ausente para a linha.");
		}
		const pickingItemId = crypto.randomUUID();

		await tx.insert(orderPickingItem).values({
			id: pickingItemId,
			pickingId,
			orderItemId,
			variantId: line.v.variant_id,
			variantSnapshot: {
				sku: line.v.sku,
				name: line.v.name,
				barcode: line.v.barcode,
				voltage: line.v.voltage,
			},
			qtyExpected: line.quantity,
			qtyPicked: line.quantity,
			notFound: false,
			lastScannedAt: null,
			createdAt: startedAt,
		});

		let lastScannedAt = startedAt;
		for (let unit = 0; unit < line.quantity; unit += 1) {
			scanCursor += 1.5 * MINUTES;
			lastScannedAt = new Date(scanCursor);
			await tx.insert(orderPickingScan).values({
				id: crypto.randomUUID(),
				pickingId,
				pickingItemId,
				variantId: line.v.variant_id,
				// Sem barcode cadastrado o operador confirmaria manualmente — o
				// scan reflete esse caminho em vez de inventar um código.
				scannedCode: line.v.barcode ?? line.v.sku,
				manual: line.v.barcode === null,
				manualReason:
					line.v.barcode === null ? "Variante sem código de barras" : null,
				scannedBy: picker.id,
				scannedByName: picker.name,
				scannedAt: lastScannedAt,
			});
		}

		await tx
			.update(orderPickingItem)
			.set({ lastScannedAt })
			.where(sql`id = ${pickingItemId}`);
	}
}

async function insertReadyToShipOrder(
	tx: Tx,
	params: {
		address: AddressRow;
		branchId: string;
		clientId: string;
		picker: PickerRow;
		spec: (typeof ORDER_SPECS)[number];
		variantsBySku: Map<string, VariantRow>;
	}
): Promise<string> {
	const { address, branchId, clientId, picker, spec, variantsBySku } = params;
	const orderId = crypto.randomUUID();
	const number = `${SEED_ORDER_PREFIX}${spec.suffix}`;

	const lines: ResolvedLine[] = spec.lines.map((l) => {
		const v = variantsBySku.get(l.sku);
		if (!v) {
			throw new Error(`[seed-ready-to-ship] SKU não encontrado: ${l.sku}`);
		}
		return { v, quantity: l.quantity };
	});

	// Linha do tempo coerente: criado → pago (20min) → em preparação (1h).
	const preparingAt = new Date(Date.now() - spec.preparingAgeHours * HOURS);
	const paidAt = new Date(preparingAt.getTime() - 1 * HOURS);
	const createdAt = new Date(paidAt.getTime() - 20 * MINUTES);

	const subtotal = lines
		.reduce(
			(sum, l) => sum + l.quantity * Number.parseFloat(l.v.price_amount),
			0
		)
		.toFixed(2);
	const totalAmount = (
		Number.parseFloat(subtotal) -
		Number.parseFloat(DISCOUNT_AMOUNT) +
		Number.parseFloat(spec.shippingAmount)
	).toFixed(2);

	await tx.insert(order).values({
		id: orderId,
		number,
		clientId,
		branchId,
		status: "preparing",
		paymentMethod: spec.paymentMethod,
		paymentProviderRef: `TEST-${orderId.slice(0, 8).toUpperCase()}`,
		subtotalAmount: subtotal,
		discountAmount: DISCOUNT_AMOUNT,
		shippingAmount: spec.shippingAmount,
		totalAmount,
		// Snapshot do endereço padrão real do cliente (a entrega congela o
		// endereço no momento do pedido — não é FK pra client_address).
		shippingAddress: {
			recipient: address.recipient,
			zipCode: formatCep(address.zip_code),
			street: address.street,
			number: address.number,
			complement: address.complement,
			neighborhood: address.neighborhood,
			city: address.city,
			state: address.state,
			country: "BR",
		},
		shippingMethod: spec.shippingMethod,
		shippingTrackingCode: null,
		notes: null,
		createdAt,
		paidAt,
		preparingAt,
	});

	const itemIds: string[] = [];
	for (const line of lines) {
		itemIds.push(await insertOrderLine(tx, { branchId, line, orderId }));
	}

	// Histórico: criação e pagamento vêm do gateway (system); a entrada em
	// preparação é ação de staff no dashboard (user) — CHECK actor_coherence
	// exige o par actorType/actorUserId coerente nos dois casos.
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
	await tx.insert(orderStatusHistory).values({
		id: crypto.randomUUID(),
		orderId,
		fromStatus: "paid",
		toStatus: "preparing",
		actorType: "user",
		actorUserId: picker.id,
		reason: null,
		createdAt: preparingAt,
	});

	// paid → preparing exige filial: a app registra a atribuição como evento.
	await tx.insert(orderEvent).values({
		id: crypto.randomUUID(),
		orderId,
		eventType: "branch_assigned",
		metadata: { branchId },
		actorType: "user",
		actorUserId: picker.id,
		createdAt: preparingAt,
	});

	await insertCompletedPicking(tx, {
		branchId,
		itemIds,
		lines,
		orderId,
		picker,
		startedAt: new Date(preparingAt.getTime() + 10 * MINUTES),
	});

	return number;
}

async function loadBase(tx: Tx): Promise<{
	address: AddressRow;
	branchId: string;
	clientId: string;
	pickers: PickerRow[];
	variants: VariantRow[];
}> {
	const branches = await tx.execute<{ id: string }>(
		sql`SELECT id FROM ${branch} WHERE status = 'active' ORDER BY created_at LIMIT 1`
	);
	const branchId = branches.rows[0]?.id;
	if (!branchId) {
		throw new Error("[seed-ready-to-ship] nenhuma branch ativa.");
	}

	// Cliente mais recente com endereço padrão — o "cliente novo" do pedido.
	const clients = await tx.execute<{
		city: string;
		client_id: string;
		complement: string | null;
		neighborhood: string;
		number: string;
		recipient: string;
		state: string;
		street: string;
		zip_code: string;
	}>(sql`
		SELECT c.id AS client_id, a.recipient, a.zip_code, a.street, a.number,
			a.complement, a.neighborhood, a.city, a.state
		FROM client c
		JOIN client_address a ON a.client_id = c.id AND a.is_default = true
		WHERE c.status = 'active'
		ORDER BY c.created_at DESC
		LIMIT 1
	`);
	const clientRow = clients.rows[0];
	if (!clientRow) {
		throw new Error(
			"[seed-ready-to-ship] nenhum client ativo com endereço padrão."
		);
	}

	// Staff da filial, preferindo quem separa no dia a dia (user/admin) ao
	// super_admin — o separador do registro fica plausível.
	const pickers = await tx.execute<{ id: string; name: string }>(sql`
		SELECT u.id, u.name
		FROM "user" u
		JOIN user_branch ub ON ub.user_id = u.id AND ub.branch_id = ${branchId}
		WHERE u.status = 'active' AND u.name <> ''
		ORDER BY CASE u.role WHEN 'user' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name
	`);
	if (pickers.rows.length === 0) {
		throw new Error(
			"[seed-ready-to-ship] nenhum usuário ativo vinculado à filial."
		);
	}

	const variants = await tx.execute<{
		barcode: string | null;
		cest: string | null;
		height_cm: string | null;
		length_cm: string | null;
		manufacturer_name: string | null;
		model: string | null;
		name: string;
		ncm: string | null;
		price_amount: string;
		sku: string;
		tool_id: string;
		variant_id: string;
		voltage: string | null;
		weight_kg: string | null;
		width_cm: string | null;
	}>(sql`
		SELECT tv.id AS variant_id, tv.tool_id, tv.sku, tv.barcode, tv.price_amount,
			tv.voltage::text AS voltage,
			t.name, t.model, t.ncm, t.cest, t.manufacturer_name,
			t.weight_kg, t.length_cm, t.width_cm, t.height_cm
		FROM tool_variant tv
		JOIN tool t ON t.id = tv.tool_id AND t.status = 'active'
		ORDER BY t.name, tv.sort_order
	`);

	return {
		address: {
			recipient: clientRow.recipient,
			zip_code: clientRow.zip_code,
			street: clientRow.street,
			number: clientRow.number,
			complement: clientRow.complement,
			neighborhood: clientRow.neighborhood,
			city: clientRow.city,
			state: clientRow.state,
		},
		branchId,
		clientId: clientRow.client_id,
		pickers: pickers.rows,
		variants: variants.rows,
	};
}

async function main() {
	const forced =
		process.argv.includes("--force") || process.env.SEED_FORCE === "1";
	if (!forced) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[seed-ready-to-ship] ABORTADO.",
				`Insere 5 pedidos ${SEED_ORDER_PREFIX}NN em 'preparing' com separação concluída,`,
				"cria carga inicial de estoque na filial e debita a venda.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Se tem certeza, rode novamente com --force (ou SEED_FORCE=1).",
			].join("\n")
		);
		process.exit(1);
	}

	await db.transaction(async (tx) => {
		const existing = await tx.execute<{ number: string }>(
			sql`SELECT number FROM "order" WHERE number LIKE ${`${SEED_ORDER_PREFIX}%`}`
		);
		if (existing.rows.length > 0) {
			throw new Error(
				`[seed-ready-to-ship] já existem ${existing.rows.length} pedidos ${SEED_ORDER_PREFIX}NN. Rode o unseed antes de recriar.`
			);
		}

		const { address, branchId, clientId, pickers, variants } =
			await loadBase(tx);

		const variantsBySku = new Map(variants.map((v) => [v.sku, v]));
		const requiredSkus = new Set(
			ORDER_SPECS.flatMap((s) => s.lines.map((l) => l.sku))
		);
		const missing = [...requiredSkus].filter((s) => !variantsBySku.has(s));
		if (missing.length > 0) {
			throw new Error(
				`[seed-ready-to-ship] SKUs ausentes no catálogo ativo: ${missing.join(", ")}`
			);
		}

		const usedVariants = [...requiredSkus].map((s) => {
			const v = variantsBySku.get(s);
			if (!v) {
				throw new Error(`[seed-ready-to-ship] SKU não resolvido: ${s}`);
			}
			return v;
		});
		const stockCreated = await ensureStock(tx, {
			branchId,
			variants: usedVariants,
		});

		const createdNumbers: string[] = [];
		for (const [index, spec] of ORDER_SPECS.entries()) {
			const picker = pickers[index % pickers.length];
			if (!picker) {
				throw new Error("[seed-ready-to-ship] picker index fora do range.");
			}
			createdNumbers.push(
				await insertReadyToShipOrder(tx, {
					address,
					branchId,
					clientId,
					picker,
					spec,
					variantsBySku,
				})
			);
		}

		console.log(
			[
				`[seed-ready-to-ship] OK — ${createdNumbers.length} pedidos: ${createdNumbers.join(", ")}`,
				`stock_level criados: ${stockCreated} (${INITIAL_STOCK_QTY} un. cada, antes do débito das vendas)`,
				"Limpeza (da raiz do monorepo): bun packages/db/scripts/unseed-ready-to-ship.ts --force",
			].join("\n")
		);
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[seed-ready-to-ship] FAIL", err);
		process.exit(1);
	});
