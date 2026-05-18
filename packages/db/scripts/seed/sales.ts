// packages/db/scripts/seed/sales.ts
import {
	order,
	orderItem,
	orderNote,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { review } from "@emach/db/schema/reviews";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { sql } from "drizzle-orm";
import type { SeedContext, Tx } from "./context";
import { pick, pickN, randInt } from "./random";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Gera timestamps passados progressivos
function daysAgo(days: number, offsetHours = 0): Date {
	const d = new Date();
	d.setDate(d.getDate() - days);
	d.setHours(d.getHours() - offsetHours);
	return d;
}

function hoursAfter(base: Date, hours: number): Date {
	return new Date(base.getTime() + hours * 3_600_000);
}

// ---------------------------------------------------------------------------
// Transições legais por status (ADR-0005)
// ---------------------------------------------------------------------------

type OrderStatus =
	| "pending_payment"
	| "paid"
	| "preparing"
	| "shipped"
	| "delivered"
	| "canceled"
	| "refunded"
	| "payment_failed"
	| "returned";

// Caminho completo pending_payment → targetStatus seguindo ADR-0005
function buildTransitionPath(target: OrderStatus): OrderStatus[] {
	switch (target) {
		case "pending_payment":
			return ["pending_payment"];
		case "payment_failed":
			return ["pending_payment", "payment_failed"];
		case "canceled":
			return ["pending_payment", "canceled"];
		case "paid":
			return ["pending_payment", "paid"];
		case "preparing":
			return ["pending_payment", "paid", "preparing"];
		case "shipped":
			return ["pending_payment", "paid", "preparing", "shipped"];
		case "delivered":
			return ["pending_payment", "paid", "preparing", "shipped", "delivered"];
		case "returned":
			return [
				"pending_payment",
				"paid",
				"preparing",
				"shipped",
				"delivered",
				"returned",
			];
		case "refunded":
			// Caminho mais longo: returned → refunded
			return [
				"pending_payment",
				"paid",
				"preparing",
				"shipped",
				"delivered",
				"returned",
				"refunded",
			];
	}
}

// Transições a partir de `paid` são conduzidas pelo staff (actorType = 'user').
// Antes de `paid` (inclusive a chegada em `paid`) são conduzidas pelo sistema.
const SYSTEM_TRANSITIONS = new Set<string>([
	"pending_payment→paid",
	"pending_payment→payment_failed",
	"pending_payment→canceled",
	"payment_failed→pending_payment",
	"payment_failed→canceled",
]);

// ---------------------------------------------------------------------------
// Definição dos 17 pedidos de seed
// ---------------------------------------------------------------------------

interface OrderScenario {
	// índice em ctx.branchIds para a filial de fulfillment
	branchIndex: number;
	// índice em ctx.clientIds
	clientIndex: number;
	// número de dias atrás em que o pedido foi criado
	createdDaysAgo: number;
	targetStatus: OrderStatus;
}

const ORDER_SCENARIOS: OrderScenario[] = [
	// Todos os 9 status representados, mais variações
	{
		clientIndex: 0,
		branchIndex: 0,
		targetStatus: "pending_payment",
		createdDaysAgo: 1,
	},
	{
		clientIndex: 1,
		branchIndex: 0,
		targetStatus: "payment_failed",
		createdDaysAgo: 3,
	},
	{ clientIndex: 2, branchIndex: 0, targetStatus: "paid", createdDaysAgo: 5 },
	{
		clientIndex: 3,
		branchIndex: 0,
		targetStatus: "preparing",
		createdDaysAgo: 7,
	},
	{
		clientIndex: 4,
		branchIndex: 0,
		targetStatus: "shipped",
		createdDaysAgo: 10,
	},
	{
		clientIndex: 5,
		branchIndex: 0,
		targetStatus: "delivered",
		createdDaysAgo: 14,
	},
	{
		clientIndex: 6,
		branchIndex: 0,
		targetStatus: "returned",
		createdDaysAgo: 20,
	},
	{
		clientIndex: 7,
		branchIndex: 0,
		targetStatus: "refunded",
		createdDaysAgo: 25,
	},
	{
		clientIndex: 8,
		branchIndex: 0,
		targetStatus: "canceled",
		createdDaysAgo: 8,
	},
	// Variações adicionais (total 17)
	{
		clientIndex: 9,
		branchIndex: 0,
		targetStatus: "delivered",
		createdDaysAgo: 18,
	},
	{
		clientIndex: 10,
		branchIndex: 0,
		targetStatus: "delivered",
		createdDaysAgo: 22,
	},
	{
		clientIndex: 11,
		branchIndex: 0,
		targetStatus: "shipped",
		createdDaysAgo: 12,
	},
	{
		clientIndex: 0,
		branchIndex: 0,
		targetStatus: "preparing",
		createdDaysAgo: 6,
	},
	{ clientIndex: 1, branchIndex: 0, targetStatus: "paid", createdDaysAgo: 4 },
	{
		clientIndex: 2,
		branchIndex: 0,
		targetStatus: "canceled",
		createdDaysAgo: 2,
	},
	{
		clientIndex: 3,
		branchIndex: 0,
		targetStatus: "refunded",
		createdDaysAgo: 30,
	},
	{
		clientIndex: 4,
		branchIndex: 0,
		targetStatus: "delivered",
		createdDaysAgo: 16,
	},
];

// Statuses que exigem débito de estoque
const PAID_STATUSES = new Set<OrderStatus>([
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"returned",
	"refunded",
]);

// Statuses elegíveis para reviews
const REVIEW_ELIGIBLE_STATUSES = new Set<OrderStatus>([
	"delivered",
	"returned",
	"refunded",
]);

// ---------------------------------------------------------------------------
// Tipos internos com itemId explícito (I3: sem cast frouxo)
// ---------------------------------------------------------------------------

interface ItemDef {
	itemId?: string;
	quantity: number;
	toolId: string;
	variantId: string;
}

// ---------------------------------------------------------------------------
// seedSales
// ---------------------------------------------------------------------------

export async function seedSales(tx: Tx, ctx: SeedContext): Promise<void> {
	const staffUserId = ctx.staffUserIds[0];
	if (!staffUserId) {
		throw new Error("staffUserIds vazio — impossível criar orders.");
	}

	// --- 1. Consultar stock_levels disponíveis ---
	// Com inventory.ts garantindo stock em todas as filiais, todo par
	// (variantId, branchId) tem stock_level — o mapa é usado apenas para
	// rastrear a quantidade disponível em memória (evitar negativo em DB).
	const stockRows = await tx.execute<{
		variant_id: string;
		branch_id: string;
		quantity: number;
	}>(sql`SELECT variant_id, branch_id, quantity FROM stock_level`);

	// Mapa: `${variantId}:${branchId}` → quantity atual (decrementado na memória)
	const stockMap = new Map<string, number>();
	for (const row of stockRows.rows) {
		stockMap.set(`${row.variant_id}:${row.branch_id}`, row.quantity);
	}

	// Mapa: variantId → toolId (para lookup reverso)
	const toolByVariant = new Map<string, string>();
	for (const [toolId, variantIds] of Object.entries(ctx.variantIdsByTool)) {
		for (const variantId of variantIds) {
			toolByVariant.set(variantId, toolId);
		}
	}

	const branchIds = ctx.branchIds;
	const allToolIds = ctx.toolIds;

	// --- 2. Inserir orders ---

	// Estrutura para armazenar itens de cada order (para reviews + estoque)
	const orderItemsByOrderId = new Map<string, ItemDef[]>();
	const orderStatusByOrderId = new Map<string, OrderStatus>();
	const orderBranchByOrderId = new Map<string, string>();

	for (let i = 0; i < ORDER_SCENARIOS.length; i++) {
		const scenario = ORDER_SCENARIOS[i];
		if (!scenario) {
			continue;
		}

		const clientId = ctx.clientIds[scenario.clientIndex % ctx.clientIds.length];
		if (!clientId) {
			continue;
		}

		const isPaid = PAID_STATUSES.has(scenario.targetStatus);

		// Escolher filial: determinístico pelo branchIndex para não-pagos;
		// para pagos, qualquer filial serve (todas têm stock garantido por C1).
		const branchId =
			branchIds[scenario.branchIndex % branchIds.length] ?? pick(branchIds);

		// Número do pedido
		const orderNumber = `EM-2026-${String(i + 1).padStart(4, "0")}`;
		const orderId = crypto.randomUUID();

		// Timestamp base do pedido
		const createdAt = daysAgo(scenario.createdDaysAgo);

		// Escolher itens do pedido
		const itemCount = randInt(1, 4);
		const itemDefs: ItemDef[] = [];

		if (isPaid) {
			// Para orders pagos: escolher ferramentas com stock disponível na filial.
			// Como inventory.ts cria stock em todas as filiais, toda variante
			// está disponível — filtramos apenas pelo saldo em memória (> 0).
			const selectedTools = pickN(allToolIds, itemCount);

			for (const toolId of selectedTools) {
				const variantIds = ctx.variantIdsByTool[toolId] ?? [];
				// Escolher variante com saldo positivo na filial
				const available = variantIds.filter(
					(vId) => (stockMap.get(`${vId}:${branchId}`) ?? 0) > 0
				);
				if (available.length === 0) {
					continue;
				}
				const variantId = pick(available);
				const stockKey = `${variantId}:${branchId}`;
				const currentQty = stockMap.get(stockKey) ?? 0;
				const qty = Math.min(randInt(1, 5), currentQty);
				if (qty <= 0) {
					continue;
				}
				stockMap.set(stockKey, currentQty - qty);
				itemDefs.push({ toolId, variantId, quantity: qty });
			}

			// Garantia: se todos os saldos estavam zerados (improvável com 80–250
			// de abertura para ~17 orders), adicionar ao menos 1 item com qty=1 e
			// reabastecer só em memória — o DB nunca ficará negativo pois a abertura
			// foi generosa; se chegar aqui, o seed está subutilizando o estoque.
			if (itemDefs.length === 0) {
				const toolId = pick(allToolIds);
				const variantIds = ctx.variantIdsByTool[toolId] ?? [];
				if (variantIds.length > 0) {
					const variantId = variantIds[0] as string;
					const stockKey = `${variantId}:${branchId}`;
					// Garantir que há saldo (mesmo que mínimo)
					const currentQty = stockMap.get(stockKey) ?? 0;
					if (currentQty > 0) {
						stockMap.set(stockKey, currentQty - 1);
						itemDefs.push({ toolId, variantId, quantity: 1 });
					}
				}
			}
		} else {
			// Orders não pagos: qualquer variante (sem débito de estoque)
			const selectedTools = pickN(allToolIds, itemCount);
			for (const toolId of selectedTools) {
				const variantIds = ctx.variantIdsByTool[toolId] ?? [];
				if (variantIds.length === 0) {
					continue;
				}
				const variantId = pick(variantIds);
				itemDefs.push({ toolId, variantId, quantity: randInt(1, 3) });
			}
		}

		if (itemDefs.length === 0) {
			// Garantia mínima absoluta: ao menos 1 item com qualquer variante
			const toolId = pick(allToolIds);
			const variantIds = ctx.variantIdsByTool[toolId] ?? [];
			const variantId = variantIds[0];
			if (variantId) {
				itemDefs.push({ toolId, variantId, quantity: 1 });
			}
		}

		// Calcular totais fictícios
		const unitPrice = "299.90";
		const subtotal = itemDefs
			.reduce((acc, item) => acc + item.quantity * 299.9, 0)
			.toFixed(2);
		const shippingAmount = "29.90";
		const totalAmount = (
			Number.parseFloat(subtotal) + Number.parseFloat(shippingAmount)
		).toFixed(2);

		// Endereço de entrega snapshot
		const shippingAddress = {
			recipient: "Cliente Emach",
			zipCode: "01310100",
			street: "Av. Paulista",
			number: "1000",
			neighborhood: "Bela Vista",
			city: "São Paulo",
			state: "SP",
			country: "BR",
		};

		// Timestamps de status
		const paidAt = PAID_STATUSES.has(scenario.targetStatus)
			? hoursAfter(createdAt, 2)
			: null;
		const shippedAt =
			scenario.targetStatus === "shipped" ||
			scenario.targetStatus === "delivered" ||
			scenario.targetStatus === "returned" ||
			scenario.targetStatus === "refunded"
				? hoursAfter(createdAt, 48)
				: null;
		const deliveredAt =
			scenario.targetStatus === "delivered" ||
			scenario.targetStatus === "returned" ||
			scenario.targetStatus === "refunded"
				? hoursAfter(createdAt, 96)
				: null;
		const canceledAt =
			scenario.targetStatus === "canceled" ? hoursAfter(createdAt, 6) : null;

		// Inserir order
		await tx.insert(order).values({
			id: orderId,
			number: orderNumber,
			clientId,
			branchId,
			status: scenario.targetStatus,
			paymentMethod: isPaid ? "pix" : null,
			paymentProviderRef: isPaid
				? `PIX-${orderId.slice(0, 8).toUpperCase()}`
				: null,
			subtotalAmount: subtotal,
			discountAmount: "0",
			shippingAmount,
			totalAmount,
			shippingAddress,
			shippingMethod: isPaid ? "PAC" : null,
			shippingTrackingCode: shippedAt
				? `BR${orderId.slice(0, 10).toUpperCase()}`
				: null,
			notes: null,
			createdAt,
			paidAt,
			shippedAt,
			deliveredAt,
			canceledAt,
		});

		ctx.orderIds.push(orderId);
		orderItemsByOrderId.set(orderId, itemDefs);
		orderStatusByOrderId.set(orderId, scenario.targetStatus);
		orderBranchByOrderId.set(orderId, branchId);

		// Inserir order_items
		for (const itemDef of itemDefs) {
			const itemId = crypto.randomUUID();
			await tx.insert(orderItem).values({
				id: itemId,
				orderId,
				toolId: itemDef.toolId,
				variantId: itemDef.variantId,
				sku: null,
				name: "Ferramenta Emach",
				model: null,
				voltage: null,
				unitPrice,
				quantity: itemDef.quantity,
				lineTotal: (itemDef.quantity * Number.parseFloat(unitPrice)).toFixed(2),
				discountAmount: "0",
				cost: null,
				ncm: null,
				cest: null,
				manufacturerName: null,
				weightKg: null,
				lengthCm: null,
				widthCm: null,
				heightCm: null,
			});
			// I3: itemId é campo do tipo, sem cast frouxo
			itemDef.itemId = itemId;
		}

		// Inserir order_status_history
		const path = buildTransitionPath(scenario.targetStatus);

		if (path.length === 1) {
			// Pedido recém-criado em pending_payment sem nenhuma transição ainda.
			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: "pending_payment",
				toStatus: "pending_payment",
				actorType: "system",
				actorUserId: null,
				reason: "criado",
				createdAt: hoursAfter(createdAt, 0),
			});
		} else {
			// Entrada de criação (from = to = pending_payment) antes das transições.
			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: "pending_payment",
				toStatus: "pending_payment",
				actorType: "system",
				actorUserId: null,
				reason: "criado",
				createdAt: hoursAfter(createdAt, 0),
			});

			for (let t = 0; t < path.length - 1; t++) {
				const fromStatus = path[t] as OrderStatus;
				const toStatus = path[t + 1] as OrderStatus;
				const transitionKey = `${fromStatus}→${toStatus}`;
				const isSystemTransition = SYSTEM_TRANSITIONS.has(transitionKey);

				const historyCreatedAt = hoursAfter(createdAt, (t + 1) * 6);

				await tx.insert(orderStatusHistory).values({
					id: crypto.randomUUID(),
					orderId,
					fromStatus,
					toStatus,
					actorType: isSystemTransition ? "system" : "user",
					actorUserId: isSystemTransition ? null : staffUserId,
					reason: null,
					createdAt: historyCreatedAt,
				});
			}
		}
	}

	// --- 3. Débito de estoque para orders pagos (C1: sem fallback que pule) ---
	// inventory.ts garante stock_level para todo (variantId, branchId).
	// Todo order_item de order pago DEVE gerar saida_venda — sem continue por
	// ausência de stock_level.
	for (const orderId of ctx.orderIds) {
		const targetStatus = orderStatusByOrderId.get(orderId);
		if (!(targetStatus && PAID_STATUSES.has(targetStatus))) {
			continue;
		}

		const branchId = orderBranchByOrderId.get(orderId);
		if (!branchId) {
			continue;
		}

		const items = orderItemsByOrderId.get(orderId) ?? [];

		for (const itemDef of items) {
			// I3: itemId lido diretamente do campo tipado (sem cast)
			const itemId = itemDef.itemId;

			const currentQtyRow = await tx.execute<{
				quantity: number;
			}>(
				sql`SELECT quantity FROM stock_level WHERE variant_id = ${itemDef.variantId} AND branch_id = ${branchId}`
			);

			if (!currentQtyRow.rows[0]) {
				// Não deveria acontecer: inventory.ts garante stock em todas as filiais.
				throw new Error(
					`[seed] stock_level ausente para variant=${itemDef.variantId} branch=${branchId} — invariante C1 violada.`
				);
			}

			const currentQty = currentQtyRow.rows[0].quantity;
			const delta = -itemDef.quantity;
			const newQty = currentQty + delta;

			if (newQty < 0) {
				// Não deveria acontecer: abertura generosa (80–250) cobre as vendas.
				throw new Error(
					`[seed] stock negativo detectado: variant=${itemDef.variantId} branch=${branchId} currentQty=${currentQty} delta=${delta}`
				);
			}

			// Inserir stock_movement saida_venda
			await tx.insert(stockMovement).values({
				id: crypto.randomUUID(),
				variantId: itemDef.variantId,
				branchId,
				previousQty: currentQty,
				newQty,
				delta,
				reason: "saida_venda",
				reasonNote: null,
				orderId,
				orderItemId: itemId ?? null,
				actorType: "system",
				actorId: null,
			});

			// Atualizar stock_level
			await tx.execute(
				sql`UPDATE stock_level SET quantity = ${newQty} WHERE variant_id = ${itemDef.variantId} AND branch_id = ${branchId}`
			);

			// Atualizar memória local (para ordens subsequentes)
			stockMap.set(`${itemDef.variantId}:${branchId}`, newQty);
		}
	}

	// --- 4. Order notes (~5) ---
	const staffAltId = ctx.staffUserIds[1] ?? ctx.staffUserIds[0] ?? staffUserId;

	const noteOrderIds = pickN(ctx.orderIds, 5);
	const noteBodies = [
		"Cliente solicitou entrega no período da tarde.",
		"Verificar disponibilidade de voltagem 127V.",
		"Pedido prioritário — cliente B2B contrato.",
		"Embalagem reforçada solicitada pelo cliente.",
		"Aguardando confirmação de endereço.",
	];

	for (let i = 0; i < noteOrderIds.length; i++) {
		const noteOrderId = noteOrderIds[i];
		if (!noteOrderId) {
			continue;
		}
		await tx.insert(orderNote).values({
			id: crypto.randomUUID(),
			orderId: noteOrderId,
			authorId: i % 2 === 0 ? staffUserId : staffAltId,
			body: noteBodies[i] ?? "Nota de pedido.",
			createdAt: daysAgo(1),
		});
	}

	// --- 5. Reviews (~9) ---
	// Somente para orders delivered/returned/refunded
	const reviewCandidates: {
		clientId: string;
		orderId: string;
		toolId: string;
	}[] = [];

	for (const orderId of ctx.orderIds) {
		const targetStatus = orderStatusByOrderId.get(orderId);
		if (!(targetStatus && REVIEW_ELIGIBLE_STATUSES.has(targetStatus))) {
			continue;
		}

		const orderRow = await tx.execute<{ client_id: string }>(
			sql`SELECT client_id FROM "order" WHERE id = ${orderId}`
		);
		const clientId = orderRow.rows[0]?.client_id;
		if (!clientId) {
			continue;
		}

		const items = orderItemsByOrderId.get(orderId) ?? [];
		for (const itemDef of items) {
			reviewCandidates.push({
				orderId,
				toolId: itemDef.toolId,
				clientId,
			});
		}
	}

	// Garantir unicidade por (toolId, clientId, orderId)
	const reviewKeys = new Set<string>();
	const reviewStatuses: Array<"pending" | "approved" | "rejected" | "spam"> = [
		"approved",
		"approved",
		"approved",
		"pending",
		"pending",
		"rejected",
		"approved",
		"spam",
		"approved",
	];

	let reviewCount = 0;
	const maxReviews = 9;

	for (const candidate of reviewCandidates) {
		if (reviewCount >= maxReviews) {
			break;
		}

		const key = `${candidate.toolId}:${candidate.clientId}:${candidate.orderId}`;
		if (reviewKeys.has(key)) {
			continue;
		}
		reviewKeys.add(key);

		const status = reviewStatuses[reviewCount] ?? "pending";
		const rating = randInt(3, 5); // reviews de produtos entregues tendem positivas

		await tx.insert(review).values({
			id: crypto.randomUUID(),
			toolId: candidate.toolId,
			clientId: candidate.clientId,
			orderId: candidate.orderId,
			rating,
			title: null,
			body: `Produto de boa qualidade. Entrega rápida. Nota ${rating}/5.`,
			status,
			moderatedBy: status === "pending" ? null : staffUserId,
			moderatedAt: status === "pending" ? null : daysAgo(1),
			moderationNote: status === "rejected" ? "Conteúdo inadequado" : null,
			createdAt: daysAgo(randInt(1, 5)),
			updatedAt: daysAgo(1),
		});

		reviewCount++;
	}
}
