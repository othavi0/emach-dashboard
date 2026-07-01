// packages/db/scripts/enrich-demo.ts
//
// Script ADITIVO e IDEMPOTENTE para "completar" o banco de demo SEM truncar.
// Diferente de seed-demo.ts (que faz TRUNCATE CASCADE de 28 tabelas e apagaria
// dados de uso orgânico como order_picking), este script só:
//   - UPDATE em linhas existentes com campos hoje nulos (branch/supplier/tool/user)
//   - INSERT aditivo de entidades novas (orders novos, refund_request, order_event)
// Tudo em UMA transação, com verificação de invariantes antes do COMMIT.
//
// Uso:
//   bun --cwd packages/db run scripts/enrich-demo.ts --dry-run   # roda e faz ROLLBACK (seguro)
//   bun --cwd packages/db run scripts/enrich-demo.ts --force      # aplica de verdade
//
// Idempotente: rodar 2x não duplica (UPDATE guarda IS NULL, INSERT checa existência).

import { user } from "@emach/db/schema/auth";
import { client, clientAddress } from "@emach/db/schema/client";
import { branch, stockLevel, userBranch } from "@emach/db/schema/inventory";
import {
	order,
	orderEvent,
	orderItem,
	orderStatusHistory,
	refundRequest,
} from "@emach/db/schema/orders";
import { promotion } from "@emach/db/schema/promotions";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { env } from "@emach/env/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../src/index";

const DRY_RUN =
	process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const FORCED =
	process.argv.includes("--force") || process.env.SEED_FORCE === "1";

class RollbackSignal extends Error {}

// ─── Dados de enriquecimento (reais para as cidades; CNPJ válido mas FICTÍCIO) ──

// CNPJ: gera dígitos verificadores corretos a partir de um root fictício de 12
// dígitos (8 base + "0001" filial). Válido no algoritmo, NÃO corresponde ao
// registro real das marcas — evita impersonar a pessoa jurídica.
function cnpjFromRoot(root8: string): string {
	const base = `${root8}0001`;
	const calc = (nums: number[]): number => {
		const weights =
			nums.length === 12
				? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
				: [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
		const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
		const r = sum % 11;
		return r < 2 ? 0 : 11 - r;
	};
	const d = base.split("").map(Number);
	const dv1 = calc(d);
	const dv2 = calc([...d, dv1]);
	return `${base}${dv1}${dv2}`; // 14 dígitos, só números
}

const BRANCH_ENRICH: Record<
	string,
	{
		cep: string;
		street: string;
		streetNumber: string;
		complement: string | null;
		neighborhood: string;
		city: string;
		state: string;
		phone: string;
		responsibleEmail: string;
		cepRanges: Array<{ from: string; to: string; label: string }>;
	}
> = {
	"Matriz — São Paulo": {
		cep: "04101000",
		street: "Rua Vergueiro",
		streetNumber: "1000",
		complement: "Galpão A",
		neighborhood: "Vila Mariana",
		city: "São Paulo",
		state: "SP",
		phone: "(11) 3288-4500",
		responsibleEmail: "othavioquiliao@gmail.com",
		cepRanges: [
			{ from: "01000000", to: "09999999", label: "Capital e Grande SP" },
		],
	},
	"Filial — Campinas": {
		cep: "13020431",
		street: "Av. Barão de Itapura",
		streetNumber: "3388",
		complement: null,
		neighborhood: "Guanabara",
		city: "Campinas",
		state: "SP",
		phone: "(19) 3234-1200",
		responsibleEmail: "maellen.mendonca01@gmail.com",
		cepRanges: [{ from: "13000000", to: "13199999", label: "Campinas e RMC" }],
	},
	"Filial — Ribeirão Preto": {
		cep: "14020260",
		street: "Av. Presidente Vargas",
		streetNumber: "2121",
		complement: null,
		neighborhood: "Jardim América",
		city: "Ribeirão Preto",
		state: "SP",
		phone: "(16) 3620-3300",
		responsibleEmail: "lucyannaborgessoares@gmail.com",
		cepRanges: [
			{ from: "14000000", to: "14109999", label: "Ribeirão Preto e região" },
		],
	},
};

const BUSINESS_HOURS = {
	weekdays: {
		isOpen: true,
		opensAt: "08:00",
		closesAt: "18:00",
		breakStart: null,
		breakEnd: null,
	},
	saturday: {
		isOpen: true,
		opensAt: "08:00",
		closesAt: "13:00",
		breakStart: null,
		breakEnd: null,
	},
	holidays: {
		isOpen: false,
		opensAt: null,
		closesAt: null,
		breakStart: null,
		breakEnd: null,
	},
};

const SUPPLIER_ENRICH: Record<
	string,
	{ root8: string; email: string; phone: string; website: string }
> = {
	"Bosch Ferramentas Ltda": {
		root8: "51000001",
		email: "vendas@bosch-demo.com.br",
		phone: "(11) 2126-1100",
		website: "https://www.bosch.com.br",
	},
	"Makita do Brasil Ferramentas": {
		root8: "51000002",
		email: "vendas@makita-demo.com.br",
		phone: "(11) 4589-8500",
		website: "https://www.makita.com.br",
	},
	"Stanley Black & Decker Brasil": {
		root8: "51000003",
		email: "contato@stanley-demo.com.br",
		phone: "(11) 3789-6000",
		website: "https://www.stanleyblackanddecker.com.br",
	},
	"Grupo Tramontina Industrial": {
		root8: "51000004",
		email: "comercial@tramontina-demo.com.br",
		phone: "(54) 3461-7000",
		website: "https://www.tramontina.com.br",
	},
	"Vonder Importações e Comércio": {
		root8: "51000005",
		email: "vendas@vonder-demo.com.br",
		phone: "(41) 3535-1900",
		website: "https://www.vonder.com.br",
	},
	"Ferramentas Ciser Distribuidora": {
		root8: "51000006",
		email: "comercial@ciser-demo.com.br",
		phone: "(47) 3441-8000",
		website: "https://www.ciser.com.br",
	},
};

// NCM real por categoria de ferramenta (capítulo 84.67 = ferramentas elétricas
// portáteis motorizadas). manufacturer = marca plausível pela linha/SKU.
const TOOL_ENRICH: Record<
	string,
	{ ncm: string; hsCode: string; manufacturer: string }
> = {
	"furadeira-de-impacto-650w": {
		ncm: "84672100",
		hsCode: "846721",
		manufacturer: "Makita",
	},
	"parafusadeira-a-bateria-18v": {
		ncm: "84672100",
		hsCode: "846721",
		manufacturer: "Makita",
	},
	"serra-circular-7-1-4-1400w": {
		ncm: "84672200",
		hsCode: "846722",
		manufacturer: "Bosch",
	},
	"serra-tico-tico-500w": {
		ncm: "84672200",
		hsCode: "846722",
		manufacturer: "Black & Decker",
	},
	"esmerilhadeira-angular-4-1-2-720w": {
		ncm: "84672900",
		hsCode: "846729",
		manufacturer: "Bosch",
	},
	"lixadeira-orbital-300w": {
		ncm: "84672900",
		hsCode: "846729",
		manufacturer: "Bosch",
	},
	"compressor-de-ar-100l-2hp": {
		ncm: "84148019",
		hsCode: "841480",
		manufacturer: "Schulz",
	},
	"martelo-carpinteiro-27mm": {
		ncm: "82052000",
		hsCode: "820520",
		manufacturer: "Tramontina",
	},
	"alicate-universal-8": {
		ncm: "82032090",
		hsCode: "820320",
		manufacturer: "Tramontina",
	},
	"plaina-eletrica-82mm-600w": {
		ncm: "84672900",
		hsCode: "846729",
		manufacturer: "Vonder",
	},
	"disco-de-corte-inox-4-1-2": {
		ncm: "68042290",
		hsCode: "680422",
		manufacturer: "Bosch",
	},
};

const ADMIN_EMAIL = "maellen.mendonca01@gmail.com";
const STAFF_ACTOR_EMAIL = "othavioquiliao@gmail.com"; // ator dos writes de staff

// Novos pedidos (client casa com a região da filial p/ coerência de CEP-routing).
type NewOrderSpec = {
	branchName: string;
	clientEmail: string;
	status: "pending_payment" | "paid" | "preparing" | "shipped" | "delivered";
	items: Array<{ sku: string; qty: number }>;
	coupon?: string; // code
	nfe?: boolean;
	tracking?: boolean;
};

const NEW_ORDERS: NewOrderSpec[] = [
	{
		branchName: "Filial — Campinas",
		clientEmail: "carlos.mota@example.com",
		status: "pending_payment",
		items: [{ sku: "GKS185S-127", qty: 1 }],
	},
	{
		branchName: "Filial — Campinas",
		clientEmail: "contato@equipamentosgerais.com.br",
		status: "paid",
		items: [
			{ sku: "CSA100B-220", qty: 1 },
			{ sku: "DC-115-INOX-10-UN", qty: 2 },
		],
	},
	{
		branchName: "Filial — Campinas",
		clientEmail: "carlos.mota@example.com",
		status: "delivered",
		items: [{ sku: "GSS280AVE-127", qty: 1 }],
		nfe: true,
		tracking: true,
	},
	{
		branchName: "Filial — Ribeirão Preto",
		clientEmail: "marcos.santos@example.com",
		status: "pending_payment",
		items: [{ sku: "AU-8-BC-UN", qty: 3 }],
	},
	{
		branchName: "Filial — Ribeirão Preto",
		clientEmail: "marcos.santos@example.com",
		status: "paid",
		coupon: "BEMVINDO10",
		items: [{ sku: "DHP453Z-220", qty: 1 }],
	},
	{
		branchName: "Filial — Ribeirão Preto",
		clientEmail: "marcos.santos@example.com",
		status: "shipped",
		items: [
			{ sku: "ST8000E-127", qty: 1 },
			{ sku: "MC-27H-UN", qty: 1 },
		],
		tracking: true,
	},
];

const SHIPPING = "29.90";
const money = (n: number) => n.toFixed(2);

const STATUS_PATH: Record<string, string[]> = {
	pending_payment: ["pending_payment"],
	paid: ["pending_payment", "paid"],
	preparing: ["pending_payment", "paid", "preparing"],
	shipped: ["pending_payment", "paid", "preparing", "shipped"],
	delivered: ["pending_payment", "paid", "preparing", "shipped", "delivered"],
};
const PAID_PLUS = new Set(["paid", "preparing", "shipped", "delivered"]);

async function main() {
	if (!(FORCED || DRY_RUN)) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[enrich-demo] ABORTADO.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Este script faz UPDATE/INSERT aditivo (NÃO trunca), mas ainda escreve no banco.",
				"",
				"Rode com --dry-run (aplica e faz ROLLBACK) para validar, ou --force para aplicar.",
			].join("\n")
		);
		process.exit(1);
	}

	const changes: string[] = [];
	try {
		await db.transaction(async (tx) => {
			// ── Lookups ──────────────────────────────────────────────────────────
			const branches = await tx
				.select({ id: branch.id, name: branch.name })
				.from(branch);
			const branchByName = new Map(branches.map((b) => [b.name, b.id]));
			const suppliers = await tx
				.select({ id: supplier.id, name: supplier.name })
				.from(supplier);
			const tools = await tx
				.select({
					id: tool.id,
					slug: tool.slug,
					name: tool.name,
					model: tool.model,
					ncm: tool.ncm,
					manufacturerName: tool.manufacturerName,
					weightKg: tool.weightKg,
					lengthCm: tool.lengthCm,
					widthCm: tool.widthCm,
					heightCm: tool.heightCm,
					cest: tool.cest,
				})
				.from(tool);
			const toolById = new Map(tools.map((t) => [t.id, t]));
			const variants = await tx
				.select({
					id: toolVariant.id,
					sku: toolVariant.sku,
					toolId: toolVariant.toolId,
					price: toolVariant.priceAmount,
					voltage: toolVariant.voltage,
				})
				.from(toolVariant);
			const variantBySku = new Map(variants.map((v) => [v.sku, v]));
			const users = await tx
				.select({
					id: user.id,
					email: user.email,
					role: user.role,
					status: user.status,
				})
				.from(user);
			const userByEmail = new Map(users.map((u) => [u.email, u]));
			const staffActorId =
				userByEmail.get(STAFF_ACTOR_EMAIL)?.id ?? users[0]?.id;
			if (!staffActorId) {
				throw new Error("Nenhum staff em `user`.");
			}

			// ── 1. Branches (UPDATE onde cep IS NULL) ───────────────────────────────
			for (const [name, e] of Object.entries(BRANCH_ENRICH)) {
				const id = branchByName.get(name);
				if (!id) {
					continue;
				}
				const respId = userByEmail.get(e.responsibleEmail)?.id ?? null;
				const res = await tx
					.update(branch)
					.set({
						cep: e.cep,
						street: e.street,
						streetNumber: e.streetNumber,
						complement: e.complement,
						neighborhood: e.neighborhood,
						city: e.city,
						state: e.state,
						phone: e.phone,
						businessHours: BUSINESS_HOURS,
						cepRanges: e.cepRanges,
						responsibleUserId: respId,
					})
					.where(and(eq(branch.id, id), isNull(branch.cep)));
				if (res.rowCount) {
					changes.push(`branch "${name}" enriquecida`);
				}
			}

			// ── 2. Suppliers (UPDATE onde cnpj IS NULL) ─────────────────────────────
			for (const s of suppliers) {
				const e = SUPPLIER_ENRICH[s.name];
				if (!e) {
					continue;
				}
				const res = await tx
					.update(supplier)
					.set({
						cnpj: cnpjFromRoot(e.root8),
						contactEmail: e.email,
						phone: e.phone,
						website: e.website,
					})
					.where(and(eq(supplier.id, s.id), isNull(supplier.cnpj)));
				if (res.rowCount) {
					changes.push(`supplier "${s.name}" enriquecido`);
				}
			}

			// ── 3. Tools (UPDATE onde ncm IS NULL) ──────────────────────────────────
			for (const t of tools) {
				const e = t.slug ? TOOL_ENRICH[t.slug] : undefined;
				if (!e) {
					continue;
				}
				const res = await tx
					.update(tool)
					.set({
						ncm: e.ncm,
						hsCode: e.hsCode,
						manufacturerName: e.manufacturer,
					})
					.where(and(eq(tool.id, t.id), isNull(tool.ncm)));
				if (res.rowCount) {
					changes.push(`tool "${t.name}" → NCM ${e.ncm} / ${e.manufacturer}`);
					// atualiza cache local p/ snapshot dos novos order_items
					const cached = toolById.get(t.id);
					if (cached) {
						cached.ncm = e.ncm;
						cached.manufacturerName = e.manufacturer;
					}
				}
			}

			// ── 4. Role 'admin' branch-scoped real ──────────────────────────────────
			const adminUser = userByEmail.get(ADMIN_EMAIL);
			if (adminUser && adminUser.role === "super_admin") {
				await tx
					.update(user)
					.set({ role: "admin" })
					.where(eq(user.id, adminUser.id));
				changes.push(`user ${ADMIN_EMAIL} → role 'admin'`);
			}
			const ribeiraoId = branchByName.get("Filial — Ribeirão Preto");
			if (adminUser && ribeiraoId) {
				const res = await tx
					.delete(userBranch)
					.where(
						and(
							eq(userBranch.userId, adminUser.id),
							eq(userBranch.branchId, ribeiraoId)
						)
					);
				if (res.rowCount) {
					changes.push(
						`${ADMIN_EMAIL} desvinculada de Ribeirão (scope Matriz+Campinas)`
					);
				}
			}

			// ── 5. Novos pedidos (Campinas/Ribeirão) ────────────────────────────────
			// Guarda de idempotência: só cria os pedidos-demo de filial se ainda não
			// existe NENHUM pedido fora da Matriz. Impede que re-rodar --force
			// empilhe cópias (o `number` vem de MAX+1, então seria append infinito).
			const matrizId = branchByName.get("Matriz — São Paulo");
			const geoOrders = (
				await tx.execute(
					sql`SELECT count(*)::int AS n FROM "order" WHERE branch_id IS DISTINCT FROM ${matrizId ?? null}`
				)
			).rows[0] as { n: number };
			const skipNewOrders = geoOrders.n > 0;
			if (skipNewOrders) {
				changes.push(
					`novos pedidos PULADOS (já há ${geoOrders.n} pedido(s) fora da Matriz — idempotência)`
				);
			}
			const existingNumbers = await tx.select({ n: order.number }).from(order);
			let maxSeq = 0;
			for (const { n } of existingNumbers) {
				const m = /EM-2026-(\d+)/.exec(n);
				if (m) {
					maxSeq = Math.max(maxSeq, Number(m[1]));
				}
			}
			const alreadyNums = new Set(existingNumbers.map((o) => o.n));
			let nfeSeq = 100;

			for (const spec of skipNewOrders ? [] : NEW_ORDERS) {
				maxSeq += 1;
				const number = `EM-2026-${String(maxSeq).padStart(4, "0")}`;
				if (alreadyNums.has(number)) {
					continue; // idempotência defensiva
				}
				const branchId = branchByName.get(spec.branchName);
				const clientRow = (
					await tx
						.select({ id: client.id, name: client.name })
						.from(client)
						.where(eq(client.email, spec.clientEmail))
				)[0];
				if (!(branchId && clientRow)) {
					continue;
				}
				const addr = (
					await tx
						.select()
						.from(clientAddress)
						.where(
							and(
								eq(clientAddress.clientId, clientRow.id),
								eq(clientAddress.isDefault, true)
							)
						)
				)[0];

				// itens + subtotal
				const items = spec.items.map((it) => {
					const v = variantBySku.get(it.sku);
					if (!v) {
						throw new Error(`variante ${it.sku} não encontrada`);
					}
					const t = toolById.get(v.toolId);
					const lineTotal = Number(v.price) * it.qty;
					return { v, t, qty: it.qty, unitPrice: v.price, lineTotal };
				});
				const subtotal = items.reduce((a, it) => a + it.lineTotal, 0);
				let discount = 0;
				let couponId: string | null = null;
				if (spec.coupon) {
					const promo = (
						await tx
							.select()
							.from(promotion)
							.where(eq(promotion.code, spec.coupon))
					)[0];
					if (promo) {
						couponId = promo.id;
						discount =
							Math.round(subtotal * (Number(promo.discountValue) / 100) * 100) /
							100;
					}
				}
				const total = subtotal - discount + Number(SHIPPING);

				const createdAt = new Date("2026-06-28T13:00:00-03:00");
				const isPaid = PAID_PLUS.has(spec.status);
				const orderId = crypto.randomUUID();
				const shippingAddress = addr
					? {
							recipient: addr.recipient,
							zipCode: addr.zipCode,
							street: addr.street,
							number: addr.number,
							complement: addr.complement ?? undefined,
							neighborhood: addr.neighborhood,
							city: addr.city,
							state: addr.state,
							country: addr.country,
						}
					: {
							recipient: clientRow.name,
							zipCode: "00000000",
							street: "N/D",
							number: "0",
							neighborhood: "N/D",
							city: "N/D",
							state: "SP",
							country: "BR",
						};

				await tx.insert(order).values({
					id: orderId,
					number,
					clientId: clientRow.id,
					branchId,
					status: spec.status,
					paymentMethod: isPaid ? "pix" : null,
					paymentProviderRef: isPaid
						? `PIX-${orderId.slice(0, 8).toUpperCase()}`
						: null,
					subtotalAmount: money(subtotal),
					discountAmount: money(discount),
					couponId,
					shippingAmount: SHIPPING,
					totalAmount: money(total),
					shippingAddress,
					shippingMethod: isPaid ? "PAC" : null,
					shippingTrackingCode: spec.tracking
						? `BR${orderId.slice(0, 10).toUpperCase()}`
						: null,
					createdAt,
					paidAt: isPaid ? new Date(createdAt.getTime() + 2 * 3600e3) : null,
					shippedAt:
						spec.status === "shipped" || spec.status === "delivered"
							? new Date(createdAt.getTime() + 48 * 3600e3)
							: null,
					deliveredAt:
						spec.status === "delivered"
							? new Date(createdAt.getTime() + 96 * 3600e3)
							: null,
				});
				changes.push(
					`order ${number} (${spec.status}, ${spec.branchName}) criado`
				);

				// order_items (snapshot real)
				const itemIds: string[] = [];
				for (const it of items) {
					const itemId = crypto.randomUUID();
					itemIds.push(itemId);
					await tx.insert(orderItem).values({
						id: itemId,
						orderId,
						toolId: it.v.toolId,
						variantId: it.v.id,
						sku: it.v.sku,
						name: it.t?.name ?? "Ferramenta",
						model: it.t?.model ?? null,
						voltage: it.v.voltage ?? null,
						unitPrice: it.unitPrice,
						quantity: it.qty,
						lineTotal: money(it.lineTotal),
						discountAmount: "0",
						ncm: it.t?.ncm ?? null,
						cest: it.t?.cest ?? null,
						manufacturerName: it.t?.manufacturerName ?? null,
						weightKg: it.t?.weightKg ?? null,
						lengthCm: it.t?.lengthCm ?? null,
						widthCm: it.t?.widthCm ?? null,
						heightCm: it.t?.heightCm ?? null,
					});
					// débito de estoque só em paid+ (ADR-0007)
					if (isPaid) {
						const sl = (
							await tx
								.select()
								.from(stockLevel)
								.where(
									and(
										eq(stockLevel.variantId, it.v.id),
										eq(stockLevel.branchId, branchId)
									)
								)
						)[0];
						const prev = sl?.quantity ?? 0;
						const next = prev - it.qty;
						await tx
							.update(stockLevel)
							.set({ quantity: next })
							.where(
								and(
									eq(stockLevel.variantId, it.v.id),
									eq(stockLevel.branchId, branchId)
								)
							);
						await tx.insert(stockMovement).values({
							id: crypto.randomUUID(),
							variantId: it.v.id,
							branchId,
							previousQty: prev,
							newQty: next,
							delta: -it.qty,
							reason: "saida_venda",
							orderId,
							orderItemId: itemId,
							actorType: "system",
							actorId: null,
							createdAt: new Date(createdAt.getTime() + 2 * 3600e3),
						});
					}
				}

				// status history (criação + transições) — actor system (fluxo ecommerce)
				const path = STATUS_PATH[spec.status];
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
				for (let i = 0; i < path.length - 1; i++) {
					await tx.insert(orderStatusHistory).values({
						id: crypto.randomUUID(),
						orderId,
						fromStatus: path[i] as never,
						toStatus: path[i + 1] as never,
						actorType: "system",
						actorUserId: null,
						createdAt: new Date(createdAt.getTime() + (i + 1) * 12 * 3600e3),
					});
				}

				// order_event: branch_assigned (staff) p/ pedidos paid+
				if (isPaid) {
					await tx.insert(orderEvent).values({
						id: crypto.randomUUID(),
						orderId,
						eventType: "branch_assigned",
						metadata: { branchId, branchName: spec.branchName },
						actorType: "user",
						actorUserId: staffActorId,
						createdAt: new Date(createdAt.getTime() + 3 * 3600e3),
					});
				}
				// order_event: tracking_set (system) p/ shipped/delivered
				if (spec.tracking) {
					await tx.insert(orderEvent).values({
						id: crypto.randomUUID(),
						orderId,
						eventType: "tracking_set",
						metadata: {
							trackingCode: `BR${orderId.slice(0, 10).toUpperCase()}`,
							carrier: "Transportadora Exemplo",
						},
						actorType: "system",
						actorUserId: null,
						createdAt: new Date(createdAt.getTime() + 48 * 3600e3),
					});
				}
				// NF-e p/ novos delivered
				if (spec.nfe) {
					nfeSeq += 1;
					await tx
						.update(order)
						.set({
							nfeNumber: String(nfeSeq).padStart(6, "0"),
							nfeStatus: "authorized",
							nfeUrl: `https://nfe.demo.emach.com.br/${orderId}.pdf`,
							nfeXmlUrl: `https://nfe.demo.emach.com.br/${orderId}.xml`,
						})
						.where(eq(order.id, orderId));
				}
			}

			// ── 6. refund_request p/ pedidos refunded/returned existentes ───────────
			const refundableOrders = await tx
				.select({
					id: order.id,
					number: order.number,
					status: order.status,
					clientId: order.clientId,
					total: order.totalAmount,
					shippedAt: order.shippedAt,
					refundedAt: order.refundedAt,
				})
				.from(order)
				.where(sql`${order.status} IN ('refunded','returned')`);
			for (const o of refundableOrders) {
				const exists = (
					await tx
						.select({ id: refundRequest.id })
						.from(refundRequest)
						.where(eq(refundRequest.orderId, o.id))
				)[0];
				if (exists) {
					continue;
				}
				const isRefunded = o.status === "refunded";
				await tx.insert(refundRequest).values({
					id: crypto.randomUUID(),
					orderId: o.id,
					clientId: o.clientId,
					reasonCategory: isRefunded ? "avaria_transporte" : "arrependimento",
					reasonText: isRefunded
						? "Produto chegou com avaria no transporte."
						: "Cliente desistiu da compra dentro do prazo.",
					status: isRefunded ? "refunded" : "approved",
					amount: o.total,
					asaasRefundRef: isRefunded ? `asaas_ref_${o.id.slice(0, 8)}` : null,
					actorType: "user",
					actorUserId: staffActorId,
					requestedAt: o.shippedAt ?? new Date("2026-06-01T12:00:00-03:00"),
					resolvedAt: isRefunded
						? (o.refundedAt ?? new Date("2026-06-05T12:00:00-03:00"))
						: null,
				});
				changes.push(
					`refund_request p/ ${o.number} (${isRefunded ? "refunded" : "approved"})`
				);
			}

			// ── 7. order_event tracking_set p/ pedidos shipped/delivered existentes ─
			const shippedOrders = await tx
				.select({
					id: order.id,
					number: order.number,
					tracking: order.shippingTrackingCode,
					shippedAt: order.shippedAt,
				})
				.from(order)
				.where(sql`${order.shippingTrackingCode} IS NOT NULL`);
			for (const o of shippedOrders) {
				const exists = (
					await tx
						.select({ id: orderEvent.id })
						.from(orderEvent)
						.where(
							and(
								eq(orderEvent.orderId, o.id),
								eq(orderEvent.eventType, "tracking_set")
							)
						)
				)[0];
				if (exists) {
					continue;
				}
				await tx.insert(orderEvent).values({
					id: crypto.randomUUID(),
					orderId: o.id,
					eventType: "tracking_set",
					metadata: {
						trackingCode: o.tracking,
						carrier: "Transportadora Exemplo",
					},
					actorType: "system",
					actorUserId: null,
					createdAt: o.shippedAt ?? new Date("2026-06-10T12:00:00-03:00"),
				});
				changes.push(`order_event tracking_set p/ ${o.number}`);
			}

			// ── 7b. shipping_reviewed: 1 pedido existente exercitando o fail-open ───
			const reviewTarget = (
				await tx
					.select({ id: order.id, number: order.number })
					.from(order)
					.where(sql`${order.status} = 'preparing'`)
					.limit(1)
			)[0];
			if (reviewTarget) {
				const exists = (
					await tx
						.select({ id: orderEvent.id })
						.from(orderEvent)
						.where(
							and(
								eq(orderEvent.orderId, reviewTarget.id),
								eq(orderEvent.eventType, "shipping_reviewed")
							)
						)
				)[0];
				if (!exists) {
					await tx.insert(orderEvent).values({
						id: crypto.randomUUID(),
						orderId: reviewTarget.id,
						eventType: "shipping_reviewed",
						metadata: { note: "Frete revisado manualmente após fail-open." },
						actorType: "user",
						actorUserId: staffActorId,
						createdAt: new Date("2026-06-27T15:00:00-03:00"),
					});
					changes.push(
						`order_event shipping_reviewed p/ ${reviewTarget.number}`
					);
				}
			}

			// ── 8. NF-e backfill p/ delivered/refunded/returned existentes ──────────
			const fulfilled = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(
					sql`${order.status} IN ('delivered','refunded','returned') AND ${order.nfeNumber} IS NULL`
				);
			for (const o of fulfilled) {
				nfeSeq += 1;
				// 1 refunded como 'cancelled' (grafia do trigger) p/ exercitar order_note automático
				const cancel = o.status === "refunded" && o.number === "EM-2026-0008";
				await tx
					.update(order)
					.set({
						nfeNumber: String(nfeSeq).padStart(6, "0"),
						nfeStatus: cancel ? "cancelled" : "authorized",
						nfeUrl: `https://nfe.demo.emach.com.br/${o.id}.pdf`,
						nfeXmlUrl: `https://nfe.demo.emach.com.br/${o.id}.xml`,
					})
					.where(eq(order.id, o.id));
				changes.push(
					`NF-e ${cancel ? "cancelled(trigger)" : "authorized"} p/ ${o.number}`
				);
			}

			// ── VERIFY (antes do commit) ────────────────────────────────────────────
			const ledger = (
				await tx.execute(sql`
				WITH mv AS (SELECT variant_id, branch_id, sum(delta) d FROM stock_movement WHERE variant_id IS NOT NULL AND branch_id IS NOT NULL GROUP BY 1,2)
				SELECT count(*)::int AS bad FROM stock_level s LEFT JOIN mv ON mv.variant_id=s.variant_id AND mv.branch_id=s.branch_id WHERE COALESCE(mv.d,0) <> s.quantity`)
			).rows[0] as { bad: number };
			if (ledger.bad > 0) {
				throw new Error(
					`VERIFY ledger falhou: ${ledger.bad} pares divergentes`
				);
			}

			const badMoney = (
				await tx.execute(
					sql`SELECT count(*)::int AS bad FROM "order" WHERE total_amount <> subtotal_amount - discount_amount + shipping_amount`
				)
			).rows[0] as { bad: number };
			if (badMoney.bad > 0) {
				throw new Error(`VERIFY money falhou: ${badMoney.bad} pedidos`);
			}

			const failClosed = (
				await tx.execute(
					sql`SELECT count(*)::int AS bad FROM "user" u WHERE u.role IN ('admin','user') AND u.status='active' AND u.id NOT IN (SELECT user_id FROM user_branch)`
				)
			).rows[0] as { bad: number };
			if (failClosed.bad > 0) {
				throw new Error(
					`VERIFY fail-closed falhou: ${failClosed.bad} usuários sem filial`
				);
			}

			const superAdmins = (
				await tx.execute(
					sql`SELECT count(*)::int AS n FROM "user" WHERE role='super_admin' AND status='active'`
				)
			).rows[0] as { n: number };
			if (superAdmins.n < 1) {
				throw new Error("VERIFY: nenhum super_admin ativo restante");
			}

			console.log(
				`[enrich-demo] VERIFY OK — ledger ${ledger.bad} / money ${badMoney.bad} / fail-closed ${failClosed.bad} / super_admins ativos ${superAdmins.n}`
			);
			console.log(`[enrich-demo] ${changes.length} mudanças:`);
			for (const c of changes) {
				console.log("  - " + c);
			}

			if (DRY_RUN) {
				throw new RollbackSignal("DRY_RUN — rollback proposital");
			}
		});
		console.log("[enrich-demo] COMMIT OK");
	} catch (err) {
		if (err instanceof RollbackSignal) {
			console.log(
				"[enrich-demo] DRY-RUN concluído — transação revertida (nada aplicado)."
			);
			process.exit(0);
		}
		console.error("[enrich-demo] FAIL", err);
		process.exit(1);
	}
}

main().then(() => process.exit(0));
