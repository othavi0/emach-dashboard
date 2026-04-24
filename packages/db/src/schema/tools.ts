import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

export type ToolStatus = "draft" | "active" | "discontinued" | "out_of_stock";

export const productType = pgTable("product_type", {
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
		model: text("model"),
		invoiceModel: text("invoice_model"),
		status: text("status").$type<ToolStatus>().notNull().default("draft"),
		voltage: text("voltage"),
		powerWatts: integer("power_watts"),
		frequencyHz: integer("frequency_hz"),
		warrantyMonths: integer("warranty_months"),
		weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
		lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
		widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
		heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
		barcode: text("barcode").unique(),
		manufacturerName: text("manufacturer_name"),
		countryOfOrigin: text("country_of_origin"),
		hsCode: text("hs_code"),
		ncm: text("ncm"),
		cest: text("cest"),
		price: numeric("price", { precision: 10, scale: 2 }),
		cost: numeric("cost", { precision: 10, scale: 2 }),
		visibleOnSite: boolean("visible_on_site").notNull().default(true),
		productTypeId: text("product_type_id")
			.notNull()
			.references(() => productType.id, { onDelete: "restrict" }),
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
		index("tool_product_type_id_idx").on(table.productTypeId),
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
		check(
			"frequency_hz_positive",
			sql`${table.frequencyHz} IS NULL OR ${table.frequencyHz} >= 0`
		),
		check(
			"warranty_months_positive",
			sql`${table.warrantyMonths} IS NULL OR ${table.warrantyMonths} >= 0`
		),
	]
);

export const productTypeRelations = relations(productType, ({ many }) => ({
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
	productType: one(productType, {
		fields: [tool.productTypeId],
		references: [productType.id],
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

export type ProductType = typeof productType.$inferSelect;
export type NewProductType = typeof productType.$inferInsert;
export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;
export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;
export type ToolImage = typeof toolImage.$inferSelect;
export type NewToolImage = typeof toolImage.$inferInsert;
