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
} from "drizzle-orm/pg-core";

import { apiKey } from "./api-keys";
import { user } from "./auth";
import { client } from "./client";
import { branch } from "./inventory";
import { actorTypeEnum } from "./shared-enums";
import { tool, toolVariant } from "./tools";

// --- Enums ---

export const orderStatusEnum = pgEnum("order_status", [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const paymentStatusEnum = pgEnum("payment_status", [
	"pending",
	"authorized",
	"paid",
	"failed",
	"refunded",
]);
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

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
		paymentStatus: paymentStatusEnum("payment_status")
			.notNull()
			.default("pending"),
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
		actorApiKeyId: text("actor_api_key_id").references(() => apiKey.id, {
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
				(${table.actorType} = 'user'   AND ${table.actorUserId}   IS NOT NULL AND ${table.actorApiKeyId} IS NULL)
				OR (${table.actorType} = 'apiKey' AND ${table.actorApiKeyId} IS NOT NULL AND ${table.actorUserId} IS NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL  AND ${table.actorApiKeyId} IS NULL)
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

// --- Relations ---

export const orderRelations = relations(order, ({ one, many }) => ({
	client: one(client, { fields: [order.clientId], references: [client.id] }),
	branch: one(branch, { fields: [order.branchId], references: [branch.id] }),
	items: many(orderItem),
	statusHistory: many(orderStatusHistory),
	notes: many(orderNote),
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
		actorApiKey: one(apiKey, {
			fields: [orderStatusHistory.actorApiKeyId],
			references: [apiKey.id],
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

// --- Types ---

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type OrderItem = typeof orderItem.$inferSelect;
export type NewOrderItem = typeof orderItem.$inferInsert;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
export type OrderNote = typeof orderNote.$inferSelect;
export type NewOrderNote = typeof orderNote.$inferInsert;
