import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { branch } from "./inventory";
import { tool } from "./tools";

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
		toolId: text("tool_id").references(() => tool.id, {
			onDelete: "set null",
		}),
		branchId: text("branch_id").references(() => branch.id, {
			onDelete: "set null",
		}),
		previousQty: integer("previous_qty").notNull(),
		newQty: integer("new_qty").notNull(),
		delta: integer("delta").notNull(),
		reason: text("reason").$type<StockMovementReason>(),
		reasonNote: text("reason_note"),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("stock_movement_tool_created_idx").on(
			table.toolId,
			table.createdAt.desc()
		),
		index("stock_movement_actor_id_idx").on(table.actorId),
	]
);

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
	tool: one(tool, {
		fields: [stockMovement.toolId],
		references: [tool.id],
	}),
	branch: one(branch, {
		fields: [stockMovement.branchId],
		references: [branch.id],
	}),
	actor: one(user, {
		fields: [stockMovement.actorId],
		references: [user.id],
	}),
}));

export type StockMovement = typeof stockMovement.$inferSelect;
export type NewStockMovement = typeof stockMovement.$inferInsert;
