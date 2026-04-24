import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { tool } from "./tools";

export const branch = pgTable("branch", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	address: text("address"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const stockLevel = pgTable(
	"stock_level",
	{
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "cascade" }),
		quantity: integer("quantity").notNull().default(0),
		minQty: integer("min_qty").notNull().default(0),
		reorderPoint: integer("reorder_point").notNull().default(0),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.toolId, table.branchId] }),
		index("stock_level_tool_id_idx").on(table.toolId),
		index("stock_level_branch_id_idx").on(table.branchId),
		check("min_qty_non_negative", sql`${table.minQty} >= 0`),
		check("reorder_point_non_negative", sql`${table.reorderPoint} >= 0`),
		check("reorder_gte_min", sql`${table.reorderPoint} >= ${table.minQty}`),
	]
);

export const branchRelations = relations(branch, ({ many }) => ({
	stockLevels: many(stockLevel),
}));

export const stockLevelRelations = relations(stockLevel, ({ one }) => ({
	tool: one(tool, {
		fields: [stockLevel.toolId],
		references: [tool.id],
	}),
	branch: one(branch, {
		fields: [stockLevel.branchId],
		references: [branch.id],
	}),
}));

export type Branch = typeof branch.$inferSelect;
export type NewBranch = typeof branch.$inferInsert;
export type StockLevel = typeof stockLevel.$inferSelect;
export type NewStockLevel = typeof stockLevel.$inferInsert;
