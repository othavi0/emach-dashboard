import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { branch } from "./inventory";
import { order, orderItem } from "./orders";
import { actorTypeEnum } from "./shared-enums";
import { toolVariant } from "./tools";

export type StockMovementReason =
	| "entrada_compra"
	| "saida_venda"
	| "ajuste_inventario"
	| "perda"
	| "outro";

export const stockMovement = pgTable(
	"stock_movement",
	{
		id: text("id").primaryKey(),
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		branchId: text("branch_id").references(() => branch.id, {
			onDelete: "set null",
		}),
		previousQty: integer("previous_qty").notNull(),
		newQty: integer("new_qty").notNull(),
		delta: integer("delta").notNull(),
		reason: text("reason").$type<StockMovementReason>().notNull(),
		reasonNote: text("reason_note"),
		orderId: text("order_id").references(() => order.id, {
			onDelete: "set null",
		}),
		orderItemId: text("order_item_id").references(() => orderItem.id, {
			onDelete: "set null",
		}),
		// auditoria
		actorType: actorTypeEnum("actor_type").notNull().default("system"),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("stock_movement_variant_created_idx").on(
			table.variantId,
			table.createdAt.desc()
		),
		index("stock_movement_order_idx").on(table.orderId),
		index("stock_movement_actor_idx").on(table.actorType, table.actorId),
		uniqueIndex("stock_movement_sale_idempotency")
			.on(table.orderItemId)
			.where(sql`reason = 'saida_venda' AND order_item_id IS NOT NULL`),
		check("delta_non_zero", sql`${table.delta} <> 0`),
		check(
			"actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorId} IS NULL)
			)`
		),
	]
);

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
	variant: one(toolVariant, {
		fields: [stockMovement.variantId],
		references: [toolVariant.id],
	}),
	branch: one(branch, {
		fields: [stockMovement.branchId],
		references: [branch.id],
	}),
	actor: one(user, {
		fields: [stockMovement.actorId],
		references: [user.id],
	}),
	order: one(order, {
		fields: [stockMovement.orderId],
		references: [order.id],
	}),
	orderItem: one(orderItem, {
		fields: [stockMovement.orderItemId],
		references: [orderItem.id],
	}),
}));

export type StockMovement = typeof stockMovement.$inferSelect;
export type NewStockMovement = typeof stockMovement.$inferInsert;
