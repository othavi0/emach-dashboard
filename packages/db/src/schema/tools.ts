import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export type ToolStatus = "draft" | "active" | "discontinued" | "out_of_stock";

export const voltageEnum = pgEnum("voltage", [
	"127V",
	"220V",
	"Bivolt",
	"380V",
]);
export type Voltage = (typeof voltageEnum.enumValues)[number];

export const supplier = pgTable(
	"supplier",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		contactEmail: text("contact_email"),
		phone: text("phone"),
		notes: text("notes"),
		website: text("website"),
		cnpj: text("cnpj"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("supplier_created_idx").on(table.createdAt.desc(), table.id.desc()),
		uniqueIndex("supplier_cnpj_unique_when_present")
			.on(table.cnpj)
			.where(sql`${table.cnpj} IS NOT NULL`),
	]
);

export const tool = pgTable(
	"tool",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").unique(),
		description: text("description"),
		model: text("model"),
		invoiceModel: text("invoice_model"),
		status: text("status").$type<ToolStatus>().notNull().default("draft"),
		powerWatts: integer("power_watts"),
		weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
		lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
		widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
		heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
		manufacturerName: text("manufacturer_name"),
		hsCode: text("hs_code"),
		ncm: text("ncm"),
		cest: text("cest"),
		visibleOnSite: boolean("visible_on_site").notNull().default(true),
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
		index("tool_created_idx").on(table.createdAt.desc(), table.id.desc()),
		index("tool_supplier_id_idx").on(table.supplierId),
		index("tool_model_idx").on(table.model),
		index("tool_invoice_model_idx").on(table.invoiceModel),
		index("tool_ncm_idx").on(table.ncm),
		index("tool_status_idx").on(table.status),
		check(
			"valid_tool_status",
			sql`${table.status} IN ('draft','active','discontinued','out_of_stock')`
		),
		check(
			"weight_positive",
			sql`${table.weightKg} IS NULL OR ${table.weightKg} >= 0`
		),
		check(
			"dimensions_positive",
			sql`(${table.lengthCm} IS NULL OR ${table.lengthCm} >= 0) AND (${table.widthCm} IS NULL OR ${table.widthCm} >= 0) AND (${table.heightCm} IS NULL OR ${table.heightCm} >= 0)`
		),
		check(
			"power_watts_positive",
			sql`${table.powerWatts} IS NULL OR ${table.powerWatts} >= 0`
		),
	]
);

export const toolVariant = pgTable(
	"tool_variant",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		sku: text("sku").notNull().unique(),
		voltage: voltageEnum("voltage"),
		priceAmount: numeric("price_amount", { precision: 10, scale: 2 }).notNull(),
		costAmount: numeric("cost_amount", { precision: 10, scale: 2 }),
		isDefault: boolean("is_default").notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("tool_variant_tool_id_idx").on(table.toolId),
		unique("tool_variant_tool_sort_unique").on(table.toolId, table.sortOrder),
		uniqueIndex("tool_variant_one_default_per_tool")
			.on(table.toolId)
			.where(sql`${table.isDefault} = true`),
		check("price_amount_positive", sql`${table.priceAmount} >= 0`),
		check(
			"cost_amount_positive",
			sql`${table.costAmount} IS NULL OR ${table.costAmount} >= 0`
		),
	]
);

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
	supplier: one(supplier, {
		fields: [tool.supplierId],
		references: [supplier.id],
	}),
	images: many(toolImage),
	variants: many(toolVariant),
}));

export const toolVariantRelations = relations(toolVariant, ({ one }) => ({
	tool: one(tool, { fields: [toolVariant.toolId], references: [tool.id] }),
}));

export const toolImageRelations = relations(toolImage, ({ one }) => ({
	tool: one(tool, { fields: [toolImage.toolId], references: [tool.id] }),
}));

export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;
export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;
export type ToolVariant = typeof toolVariant.$inferSelect;
export type NewToolVariant = typeof toolVariant.$inferInsert;
export type ToolImage = typeof toolImage.$inferSelect;
export type NewToolImage = typeof toolImage.$inferInsert;
