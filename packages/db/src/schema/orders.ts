import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./client";
import { branch } from "./inventory";
import { promotion } from "./promotions";
import { actorTypeEnum } from "./shared-enums";
import { tool, toolVariant } from "./tools";

// --- Enums ---

// A ordem reflete o DB, não o ciclo de vida lógico: Postgres ALTER TYPE
// só faz ADD VALUE no fim. Não reordenar — quebraria o sync com o snapshot.
export const orderStatusEnum = pgEnum("order_status", [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
	"payment_failed",
	"returned",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const refundReasonEnum = pgEnum("refund_reason", [
	"defeito",
	"item_errado",
	"avaria_transporte",
	"arrependimento",
	"outro",
]);
export type RefundReason = (typeof refundReasonEnum.enumValues)[number];

export const refundStatusEnum = pgEnum("refund_status", [
	"requested",
	"under_review",
	"approved",
	"refunded",
	"rejected",
]);
export type RefundStatus = (typeof refundStatusEnum.enumValues)[number];

// Tipos de evento operacional auditável que não são transição de status.
// Aditivo: novos valores entram no fim (mesma regra do orderStatusEnum).
export const orderEventTypeEnum = pgEnum("order_event_type", [
	"tracking_set",
	"branch_assigned",
	"shipping_reviewed",
]);
export type OrderEventType = (typeof orderEventTypeEnum.enumValues)[number];

export const orderPickingStatusEnum = pgEnum("order_picking_status", [
	"in_progress",
	"completed",
	"exception",
	"canceled",
]);
export type OrderPickingStatus =
	(typeof orderPickingStatusEnum.enumValues)[number];

// Status que contam como solicitação ATIVA de refund (não-terminal).
// Fonte única: o índice parcial refund_request_one_open_per_order (abaixo) deriva
// daqui; o ecommerce importa via @emach/db (sync CI). Ver issue #96.
export const ACTIVE_REFUND_STATUSES = [
	"requested",
	"under_review",
	"approved",
] as const satisfies readonly RefundStatus[];

// --- Tables ---

export const order = pgTable(
	"order",
	{
		id: text("id").primaryKey(),
		number: text("number").unique().notNull(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "restrict" }),
		branchId: text("branch_id").references(() => branch.id, {
			onDelete: "set null",
		}),
		status: orderStatusEnum("status").notNull().default("pending_payment"),
		paymentMethod: text("payment_method"),
		paymentProviderRef: text("payment_provider_ref"),
		subtotalAmount: numeric("subtotal_amount", {
			precision: 12,
			scale: 2,
		}).notNull(),
		// Captura APENAS o desconto de cupom (promotion type='promocode').
		// A economia da promoção AUTOMÁTICA (type='promotion') NÃO entra aqui:
		// já está embutida no subtotalAmount, porque o unit_price de cada
		// order_item é o preço pós-auto-promo. A invariante
		// subtotal − discount + shipping = total fecha, mas relatório de margem
		// que ler discountAmount como "desconto total concedido" SUBCONTA — para
		// o total realmente concedido, derivar a economia de auto-promo comparando
		// order_item.unit_price com o preço de catálogo na data do pedido. (issue #124)
		discountAmount: numeric("discount_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		// Cupom aplicado no checkout (escrito pelo ecommerce). set null: se a
		// promotion for deletada, o pedido preserva o histórico monetário em
		// discountAmount mas perde o vínculo.
		couponId: text("coupon_id").references(() => promotion.id, {
			onDelete: "set null",
		}),
		shippingAmount: numeric("shipping_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		totalAmount: numeric("total_amount", {
			precision: 12,
			scale: 2,
		}).notNull(),
		shippingAddress: jsonb("shipping_address").notNull(),
		shippingMethod: text("shipping_method"),
		shippingTrackingCode: text("shipping_tracking_code"),
		// Código composto do serviço Frenet (`CarrierCode-ServiceCode`, ex.
		// "COR-41106") escolhido no checkout. Necessário no rastreamento Frenet
		// (`POST /tracking/trackinginfo` exige ShippingServiceCode + TrackingNumber).
		// Nullable: pedidos legados e "Frete a combinar" não têm serviço — sem
		// backfill. Escrito pelo ecommerce pós-sync (ecommerce#186); o dashboard
		// só lê (futuro job/UI de tracking).
		shippingServiceCode: text("shipping_service_code"),
		// true = frete não pôde ser revalidado server-side no checkout (API de
		// frete indisponível); staff revisa antes de faturar. Escrito pelo
		// ecommerce no fail-open (issue #143 / ecommerce#97); o dashboard limpa
		// via markShippingReviewed.
		shippingUnverified: boolean("shipping_unverified").notNull().default(false),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		shippedAt: timestamp("shipped_at", { withTimezone: true }),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		preparingAt: timestamp("preparing_at", { withTimezone: true }),
		returnedAt: timestamp("returned_at", { withTimezone: true }),
		refundedAt: timestamp("refunded_at", { withTimezone: true }),
		paymentReceiptUrl: text("payment_receipt_url"),
		nfeNumber: text("nfe_number"),
		// Série da NF-e (obrigatória junto com o número) e chave de acesso de 44
		// dígitos (consulta/cancelamento na SEFAZ). Escritos pelo ecommerce/provedor
		// fiscal — o dashboard só lê (ADR-0027).
		nfeSeries: text("nfe_series"),
		nfeAccessKey: text("nfe_access_key"),
		nfeUrl: text("nfe_url"),
		nfeXmlUrl: text("nfe_xml_url"),
		nfeStatus: text("nfe_status"),
	},
	(table) => [
		index("order_client_id_idx").on(table.clientId),
		index("order_branch_id_idx").on(table.branchId),
		index("order_status_created_idx").on(table.status, table.createdAt.desc()),
		index("order_branch_status_created_idx").on(
			table.branchId,
			table.status,
			table.createdAt.desc()
		),
		// Chave de acesso da NF-e, quando presente, tem exatamente 44 dígitos (ADR-0027).
		check(
			"nfe_access_key_len",
			sql`${table.nfeAccessKey} IS NULL OR length(${table.nfeAccessKey}) = 44`
		),
	]
);

export const orderItem = pgTable(
	"order_item",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "restrict" }),
		variantId: text("variant_id")
			.notNull()
			.references(() => toolVariant.id, { onDelete: "restrict" }),
		sku: text("sku"),
		barcode: text("barcode"),
		name: text("name").notNull(),
		model: text("model"),
		voltage: text("voltage"),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		quantity: integer("quantity").notNull(),
		lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
		discountAmount: numeric("discount_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		ncm: text("ncm"),
		cest: text("cest"),
		manufacturerName: text("manufacturer_name"),
		weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
		lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
		widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
		heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
	},
	(table) => [
		index("order_item_order_id_idx").on(table.orderId),
		check("quantity_positive", sql`${table.quantity} > 0`),
	]
);

export const orderStatusHistory = pgTable(
	"order_status_history",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		fromStatus: orderStatusEnum("from_status").notNull(),
		toStatus: orderStatusEnum("to_status").notNull(),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reason: text("reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_status_history_order_idx").on(
			table.orderId,
			table.createdAt.desc()
		),
		check(
			"actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const orderNote = pgTable(
	"order_note",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		authorId: text("author_id").references(() => user.id, {
			onDelete: "set null",
		}),
		body: text("body").notNull(),
		// Status do pedido no instante em que a nota foi escrita — contexto de leitura,
		// não muda o escopo (a nota continua vinculada ao pedido). Nullable: notas
		// antigas / criadas pelo storefront podem não ter.
		statusAtCreation: orderStatusEnum("status_at_creation"),
		pinned: boolean("pinned").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_note_order_idx").on(table.orderId, table.createdAt.desc()),
	]
);

export const orderAttachment = pgTable(
	"order_attachment",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		fileUrl: text("file_url").notNull(),
		fileName: text("file_name").notNull(),
		fileSize: integer("file_size"),
		mimeType: text("mime_type"),
		label: text("label"),
		description: text("description"),
		uploadedBy: text("uploaded_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_attachment_order_created_idx").on(
			table.orderId,
			table.createdAt.desc()
		),
	]
);

export const orderEvent = pgTable(
	"order_event",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		eventType: orderEventTypeEnum("event_type").notNull(),
		metadata: jsonb("metadata"),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_event_order_idx").on(table.orderId, table.createdAt.desc()),
		check(
			"order_event_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const refundRequest = pgTable(
	"refund_request",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "restrict" }),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "restrict" }),
		reasonCategory: refundReasonEnum("reason_category").notNull(),
		reasonText: text("reason_text"),
		status: refundStatusEnum("status").notNull().default("requested"),
		// snapshot do total do pedido no momento da solicitação
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		asaasRefundRef: text("asaas_refund_ref"),
		rejectionReason: text("rejection_reason"),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("refund_request_client_idx").on(
			table.clientId,
			table.requestedAt.desc()
		),
		index("refund_request_order_idx").on(table.orderId),
		// 1 solicitação ATIVA por pedido (parcial: status não-terminal).
		// Predicado derivado de ACTIVE_REFUND_STATUSES — fonte única (issue #96).
		uniqueIndex("refund_request_one_open_per_order")
			.on(table.orderId)
			.where(
				sql.raw(
					`status IN (${ACTIVE_REFUND_STATUSES.map((s) => `'${s}'`).join(", ")})`
				)
			),
		check(
			"refund_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const orderPicking = pgTable(
	"order_picking",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "restrict" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "restrict" }),
		status: orderPickingStatusEnum("status").notNull().default("in_progress"),
		pickerUserId: text("picker_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		pickerName: text("picker_name").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		exceptionReason: text("exception_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// 1 sessão ATIVA por pedido (anti-concorrência). Partial: só in_progress.
		uniqueIndex("order_picking_one_active")
			.on(table.orderId)
			.where(sql`status = 'in_progress'`),
		index("order_picking_branch_status_idx").on(
			table.branchId,
			table.status,
			table.startedAt.desc()
		),
	]
);

export const orderPickingItem = pgTable(
	"order_picking_item",
	{
		id: text("id").primaryKey(),
		pickingId: text("picking_id")
			.notNull()
			.references(() => orderPicking.id, { onDelete: "cascade" }),
		orderItemId: text("order_item_id").references(() => orderItem.id, {
			onDelete: "set null",
		}),
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		variantSnapshot: jsonb("variant_snapshot").notNull(),
		qtyExpected: integer("qty_expected").notNull(),
		qtyPicked: integer("qty_picked").notNull().default(0),
		notFound: boolean("not_found").notNull().default(false),
		lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("order_picking_item_unique").on(
			table.pickingId,
			table.orderItemId
		),
		check("qty_expected_positive", sql`${table.qtyExpected} > 0`),
		check(
			"qty_picked_within",
			sql`${table.qtyPicked} >= 0 AND ${table.qtyPicked} <= ${table.qtyExpected}`
		),
	]
);

export const orderPickingScan = pgTable(
	"order_picking_scan",
	{
		id: text("id").primaryKey(),
		pickingId: text("picking_id")
			.notNull()
			.references(() => orderPicking.id, { onDelete: "cascade" }),
		pickingItemId: text("picking_item_id")
			.notNull()
			.references(() => orderPickingItem.id, { onDelete: "cascade" }),
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		scannedCode: text("scanned_code").notNull(),
		scannedBy: text("scanned_by").references(() => user.id, {
			onDelete: "set null",
		}),
		scannedByName: text("scanned_by_name").notNull(),
		scannedAt: timestamp("scanned_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_picking_scan_session_idx").on(
			table.pickingId,
			table.scannedAt.desc()
		),
	]
);

// --- Relations ---

export const orderRelations = relations(order, ({ one, many }) => ({
	client: one(client, { fields: [order.clientId], references: [client.id] }),
	branch: one(branch, { fields: [order.branchId], references: [branch.id] }),
	items: many(orderItem),
	statusHistory: many(orderStatusHistory),
	notes: many(orderNote),
	attachments: many(orderAttachment),
	refundRequests: many(refundRequest),
	events: many(orderEvent),
	pickings: many(orderPicking),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
	order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
	tool: one(tool, { fields: [orderItem.toolId], references: [tool.id] }),
	variant: one(toolVariant, {
		fields: [orderItem.variantId],
		references: [toolVariant.id],
	}),
}));

export const orderStatusHistoryRelations = relations(
	orderStatusHistory,
	({ one }) => ({
		order: one(order, {
			fields: [orderStatusHistory.orderId],
			references: [order.id],
		}),
		actorUser: one(user, {
			fields: [orderStatusHistory.actorUserId],
			references: [user.id],
		}),
	})
);

export const orderNoteRelations = relations(orderNote, ({ one }) => ({
	order: one(order, {
		fields: [orderNote.orderId],
		references: [order.id],
	}),
	author: one(user, {
		fields: [orderNote.authorId],
		references: [user.id],
	}),
}));

export const orderAttachmentRelations = relations(
	orderAttachment,
	({ one }) => ({
		order: one(order, {
			fields: [orderAttachment.orderId],
			references: [order.id],
		}),
		uploadedByUser: one(user, {
			fields: [orderAttachment.uploadedBy],
			references: [user.id],
		}),
	})
);

export const refundRequestRelations = relations(refundRequest, ({ one }) => ({
	order: one(order, {
		fields: [refundRequest.orderId],
		references: [order.id],
	}),
	client: one(client, {
		fields: [refundRequest.clientId],
		references: [client.id],
	}),
	actorUser: one(user, {
		fields: [refundRequest.actorUserId],
		references: [user.id],
	}),
}));

export const orderEventRelations = relations(orderEvent, ({ one }) => ({
	order: one(order, { fields: [orderEvent.orderId], references: [order.id] }),
	actorUser: one(user, {
		fields: [orderEvent.actorUserId],
		references: [user.id],
	}),
}));

export const orderPickingRelations = relations(
	orderPicking,
	({ one, many }) => ({
		order: one(order, {
			fields: [orderPicking.orderId],
			references: [order.id],
		}),
		branch: one(branch, {
			fields: [orderPicking.branchId],
			references: [branch.id],
		}),
		picker: one(user, {
			fields: [orderPicking.pickerUserId],
			references: [user.id],
		}),
		items: many(orderPickingItem),
		scans: many(orderPickingScan),
	})
);

export const orderPickingItemRelations = relations(
	orderPickingItem,
	({ one }) => ({
		picking: one(orderPicking, {
			fields: [orderPickingItem.pickingId],
			references: [orderPicking.id],
		}),
		orderItem: one(orderItem, {
			fields: [orderPickingItem.orderItemId],
			references: [orderItem.id],
		}),
		variant: one(toolVariant, {
			fields: [orderPickingItem.variantId],
			references: [toolVariant.id],
		}),
	})
);

export const orderPickingScanRelations = relations(
	orderPickingScan,
	({ one }) => ({
		picking: one(orderPicking, {
			fields: [orderPickingScan.pickingId],
			references: [orderPicking.id],
		}),
		pickingItem: one(orderPickingItem, {
			fields: [orderPickingScan.pickingItemId],
			references: [orderPickingItem.id],
		}),
		scannedByUser: one(user, {
			fields: [orderPickingScan.scannedBy],
			references: [user.id],
		}),
	})
);

// --- Types ---

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type OrderItem = typeof orderItem.$inferSelect;
export type NewOrderItem = typeof orderItem.$inferInsert;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
export type OrderNote = typeof orderNote.$inferSelect;
export type NewOrderNote = typeof orderNote.$inferInsert;
export type OrderAttachment = typeof orderAttachment.$inferSelect;
export type NewOrderAttachment = typeof orderAttachment.$inferInsert;
export type RefundRequest = typeof refundRequest.$inferSelect;
export type NewRefundRequest = typeof refundRequest.$inferInsert;
export type OrderEvent = typeof orderEvent.$inferSelect;
export type NewOrderEvent = typeof orderEvent.$inferInsert;
export type OrderPicking = typeof orderPicking.$inferSelect;
export type NewOrderPicking = typeof orderPicking.$inferInsert;
export type OrderPickingItem = typeof orderPickingItem.$inferSelect;
export type NewOrderPickingItem = typeof orderPickingItem.$inferInsert;
export type OrderPickingScan = typeof orderPickingScan.$inferSelect;
export type NewOrderPickingScan = typeof orderPickingScan.$inferInsert;
