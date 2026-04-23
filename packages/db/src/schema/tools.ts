import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

export const category = pgTable("category", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	description: text("description"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const supplier = pgTable("supplier", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	contactEmail: text("contact_email"),
	phone: text("phone"),
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const tool = pgTable(
	"tool",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").unique(),
		description: text("description"),
		sku: text("sku").unique(),
		voltage: text("voltage"),
		price: numeric("price", { precision: 10, scale: 2 }),
		cost: numeric("cost", { precision: 10, scale: 2 }),
		visibleOnSite: boolean("visible_on_site").notNull().default(true),
		categoryId: text("category_id").references(() => category.id, {
			onDelete: "cascade",
		}),
		supplierId: text("supplier_id").references(() => supplier.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("tool_category_id_idx").on(table.categoryId),
		index("tool_supplier_id_idx").on(table.supplierId),
	]
);

export const categoryRelations = relations(category, ({ many }) => ({
	tools: many(tool),
}));

export const supplierRelations = relations(supplier, ({ many }) => ({
	tools: many(tool),
}));

export const toolImage = pgTable(
	"tool_image",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		sortOrder: integer("sort_order").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("tool_image_tool_sort_unique").on(table.toolId, table.sortOrder),
		index("tool_image_tool_sort_idx").on(table.toolId, table.sortOrder),
	]
);

export const toolRelations = relations(tool, ({ one, many }) => ({
	category: one(category, {
		fields: [tool.categoryId],
		references: [category.id],
	}),
	supplier: one(supplier, {
		fields: [tool.supplierId],
		references: [supplier.id],
	}),
	images: many(toolImage),
}));

export const toolImageRelations = relations(toolImage, ({ one }) => ({
	tool: one(tool, {
		fields: [toolImage.toolId],
		references: [tool.id],
	}),
}));

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;
export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;
export type ToolImage = typeof toolImage.$inferSelect;
export type NewToolImage = typeof toolImage.$inferInsert;
