import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const shippingBox = pgTable(
	"shipping_box",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		internalLengthCm: numeric("internal_length_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		internalWidthCm: numeric("internal_width_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		internalHeightCm: numeric("internal_height_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		maxWeightKg: numeric("max_weight_kg", {
			precision: 10,
			scale: 3,
		}).notNull(),
		tareWeightKg: numeric("tare_weight_kg", { precision: 10, scale: 3 })
			.notNull()
			.default("0"),
		active: boolean("active").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("shipping_box_active_idx").on(table.active, table.sortOrder),
		check(
			"shipping_box_dimensions_positive",
			sql`${table.internalLengthCm} >= 0 AND ${table.internalWidthCm} >= 0 AND ${table.internalHeightCm} >= 0 AND ${table.maxWeightKg} >= 0 AND ${table.tareWeightKg} >= 0`
		),
	]
);

export type ShippingBox = typeof shippingBox.$inferSelect;
export type NewShippingBox = typeof shippingBox.$inferInsert;
