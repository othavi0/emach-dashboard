import { relations, sql } from "drizzle-orm";
import {
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
		discountAmount: numeric("discount_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
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
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		paidAt: timestamp("paid_at"),
		shippedAt: timestamp("shipped_at"),
		deliveredAt: timestamp("delivered_at"),
		canceledAt: timestamp("canceled_at"),
		preparingAt: timestamp("preparing_at"),
		returnedAt: timestamp("returned_at"),
		refundedAt: timestamp("refunded_at"),
		paymentReceiptUrl: text("payment_receipt_url"),
		nfeNumber: text("nfe_number"),
		nfeUrl: text("nfe_url"),
		nfeXmlUrl: text("nfe_xml_url"),
		nfeStatus: text("nfe_status"),
	},
	(table) => [
		index("order_client_id_idx").on(table.clientId),
		index("order_branch_id_idx").on(table.branchId),
		index("order_status_created_idx").on(table.status, table.createdAt.desc()),
		index("order_number_idx").on(table.number),
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
		cost: numeric("cost", { precision: 12, scale: 2 }),
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
		createdAt: timestamp("created_at").defaultNow().notNull(),
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
		createdAt: timestamp("created_at").defaultNow().notNull(),
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
		uploadedBy: text("uploaded_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_attachment_order_created_idx").on(
			table.orderId,
			table.createdAt.desc()
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
		requestedAt: timestamp("requested_at").defaultNow().notNull(),
		resolvedAt: timestamp("resolved_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("refund_request_client_idx").on(
			table.clientId,
			table.requestedAt.desc()
		),
		index("refund_request_order_idx").on(table.orderId),
		// 1 solicitação ATIVA por pedido (parcial: status não-terminal).
		// Espelha ACTIVE_REFUND_STATUSES do ecommerce: requested + under_review + approved.
		uniqueIndex("refund_request_one_open_per_order")
			.on(table.orderId)
			.where(sql`${table.status} IN ('requested', 'under_review', 'approved')`),
		check(
			"refund_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
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
