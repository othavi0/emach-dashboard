import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { tool } from "./tools";

export const category = pgTable(
	"category",
	{
		id: text("id").primaryKey(),
		slug: text("slug").unique().notNull(),
		name: text("name").notNull(),
		parentId: text("parent_id").references((): AnyPgColumn => category.id, {
			onDelete: "restrict",
		}),
		sortOrder: integer("sort_order").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		description: text("description"),
		path: text("path").notNull(),
		depth: integer("depth").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		check(
			"parent_neq_self",
			sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
		),
		check("depth_max_5", sql`${table.depth} >= 0 AND ${table.depth} <= 5`),
		index("category_parent_idx").on(table.parentId),
		index("category_path_idx").on(table.path),
	]
);

export const toolCategory = pgTable(
	"tool_category",
	{
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		categoryId: text("category_id")
			.notNull()
			.references(() => category.id, { onDelete: "restrict" }),
		isPrimary: boolean("is_primary").notNull().default(false),
	},
	(table) => [
		primaryKey({ columns: [table.toolId, table.categoryId] }),
		uniqueIndex("tool_category_one_primary")
			.on(table.toolId)
			.where(sql`${table.isPrimary} = true`),
	]
);

export const categoryRelations = relations(category, ({ one, many }) => ({
	parent: one(category, {
		fields: [category.parentId],
		references: [category.id],
		relationName: "parent",
	}),
	children: many(category, { relationName: "parent" }),
	tools: many(toolCategory),
}));

export const toolCategoryRelations = relations(toolCategory, ({ one }) => ({
	tool: one(tool, { fields: [toolCategory.toolId], references: [tool.id] }),
	category: one(category, {
		fields: [toolCategory.categoryId],
		references: [category.id],
	}),
}));

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type ToolCategory = typeof toolCategory.$inferSelect;
export type NewToolCategory = typeof toolCategory.$inferInsert;
