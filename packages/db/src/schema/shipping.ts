import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Mesmo shape de branch.cep_ranges (queries/branch-cep.ts: CepRange).
export interface CarrierCepRange {
	from: string;
	label?: string;
	to: string;
}

export const carrier = pgTable(
	"carrier",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		cnpj: text("cnpj"),
		active: boolean("active").notNull().default(true),
		// Divisor de peso cubado: Correios/aéreo 6000; rodoviário pode variar.
		cubageDivisor: integer("cubage_divisor").notNull().default(6000),
		grisPercent: numeric("gris_percent", { precision: 5, scale: 2 }),
		grisMinAmount: numeric("gris_min_amount", { precision: 10, scale: 2 }),
		advaloremPercent: numeric("advalorem_percent", { precision: 5, scale: 2 }),
		tollAmount: numeric("toll_amount", { precision: 10, scale: 2 }),
		icmsPercent: numeric("icms_percent", { precision: 5, scale: 2 }),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("carrier_active_idx").on(table.active, table.createdAt.desc()),
		uniqueIndex("carrier_cnpj_unique_when_present")
			.on(table.cnpj)
			.where(sql`${table.cnpj} IS NOT NULL`),
		check("carrier_cubage_divisor_positive", sql`${table.cubageDivisor} > 0`),
		check(
			"carrier_percents_valid",
			sql`(${table.grisPercent} IS NULL OR (${table.grisPercent} >= 0 AND ${table.grisPercent} <= 100)) AND (${table.advaloremPercent} IS NULL OR (${table.advaloremPercent} >= 0 AND ${table.advaloremPercent} <= 100)) AND (${table.icmsPercent} IS NULL OR (${table.icmsPercent} >= 0 AND ${table.icmsPercent} < 100))`
		),
		check(
			"carrier_amounts_non_negative",
			sql`(${table.grisMinAmount} IS NULL OR ${table.grisMinAmount} >= 0) AND (${table.tollAmount} IS NULL OR ${table.tollAmount} >= 0)`
		),
	]
);

export const carrierZone = pgTable(
	"carrier_zone",
	{
		id: text("id").primaryKey(),
		carrierId: text("carrier_id")
			.notNull()
			.references(() => carrier.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		cepRanges: jsonb("cep_ranges")
			.$type<CarrierCepRange[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		deliveryDays: integer("delivery_days"),
		minFreightAmount: numeric("min_freight_amount", {
			precision: 10,
			scale: 2,
		}),
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
		index("carrier_zone_carrier_idx").on(table.carrierId, table.sortOrder),
		check(
			"carrier_zone_values_non_negative",
			sql`(${table.deliveryDays} IS NULL OR ${table.deliveryDays} >= 0) AND (${table.minFreightAmount} IS NULL OR ${table.minFreightAmount} >= 0)`
		),
	]
);

export const carrierRate = pgTable(
	"carrier_rate",
	{
		id: text("id").primaryKey(),
		carrierId: text("carrier_id")
			.notNull()
			.references(() => carrier.id, { onDelete: "cascade" }),
		zoneId: text("zone_id")
			.notNull()
			.references(() => carrierZone.id, { onDelete: "cascade" }),
		weightFromKg: numeric("weight_from_kg", {
			precision: 10,
			scale: 3,
		}).notNull(),
		// NULL = ∞ (faixa topo).
		weightToKg: numeric("weight_to_kg", { precision: 10, scale: 3 }),
		baseAmount: numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
		perKgAmount: numeric("per_kg_amount", { precision: 10, scale: 2 })
			.notNull()
			.default("0"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("carrier_rate_zone_from_unique").on(
			table.zoneId,
			table.weightFromKg
		),
		index("carrier_rate_carrier_idx").on(table.carrierId),
		check(
			"carrier_rate_weight_valid",
			sql`${table.weightFromKg} >= 0 AND (${table.weightToKg} IS NULL OR ${table.weightToKg} > ${table.weightFromKg})`
		),
		check(
			"carrier_rate_amounts_non_negative",
			sql`${table.baseAmount} >= 0 AND ${table.perKgAmount} >= 0`
		),
	]
);

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

export const carrierRelations = relations(carrier, ({ many }) => ({
	zones: many(carrierZone),
	rates: many(carrierRate),
}));

export const carrierZoneRelations = relations(carrierZone, ({ one, many }) => ({
	carrier: one(carrier, {
		fields: [carrierZone.carrierId],
		references: [carrier.id],
	}),
	rates: many(carrierRate),
}));

export const carrierRateRelations = relations(carrierRate, ({ one }) => ({
	carrier: one(carrier, {
		fields: [carrierRate.carrierId],
		references: [carrier.id],
	}),
	zone: one(carrierZone, {
		fields: [carrierRate.zoneId],
		references: [carrierZone.id],
	}),
}));

export type Carrier = typeof carrier.$inferSelect;
export type NewCarrier = typeof carrier.$inferInsert;
export type CarrierZone = typeof carrierZone.$inferSelect;
export type NewCarrierZone = typeof carrierZone.$inferInsert;
export type CarrierRate = typeof carrierRate.$inferSelect;
export type NewCarrierRate = typeof carrierRate.$inferInsert;
export type ShippingBox = typeof shippingBox.$inferSelect;
export type NewShippingBox = typeof shippingBox.$inferInsert;
