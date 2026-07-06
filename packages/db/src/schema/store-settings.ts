import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { branch } from "./inventory";

export type ShippingInsurancePolicy = "none" | "cart_value";

export const storeSettings = pgTable(
	"store_settings",
	{
		// Singleton: id fixo "singleton" garantido pelo check abaixo.
		id: text("id").primaryKey().default("singleton"),
		shippingOriginBranchId: text("shipping_origin_branch_id").references(
			() => branch.id,
			{ onDelete: "set null" }
		),
		shippingInsurancePolicy: text("shipping_insurance_policy")
			.$type<ShippingInsurancePolicy>()
			.notNull()
			.default("none"),
		shippingInsuranceCapAmount: numeric("shipping_insurance_cap_amount", {
			precision: 10,
			scale: 2,
		})
			.notNull()
			.default("3000.00"),
		// Fração máxima do volume interno ocupável na consolidação (folga de
		// empacotamento). Consumido pelo storefront via getShippingSettings.
		shippingFillFactor: numeric("shipping_fill_factor", {
			precision: 3,
			scale: 2,
		})
			.notNull()
			.default("0.90"),
		// Acréscimo externo por dimensão (cm) nas caixas cotadas (parede/aba).
		shippingBoxPaddingCm: numeric("shipping_box_padding_cm", {
			precision: 10,
			scale: 2,
		})
			.notNull()
			.default("0"),
		// Redes sociais — URL completa do perfil + flag de exibição no storefront.
		// `visible` default false: a rede só aparece no site após ter link e ser
		// ligada explicitamente.
		socialInstagramUrl: text("social_instagram_url"),
		socialInstagramVisible: boolean("social_instagram_visible")
			.notNull()
			.default(false),
		socialLinkedinUrl: text("social_linkedin_url"),
		socialLinkedinVisible: boolean("social_linkedin_visible")
			.notNull()
			.default(false),
		socialFacebookUrl: text("social_facebook_url"),
		socialFacebookVisible: boolean("social_facebook_visible")
			.notNull()
			.default(false),
		socialXUrl: text("social_x_url"),
		socialXVisible: boolean("social_x_visible").notNull().default(false),
		socialYoutubeUrl: text("social_youtube_url"),
		socialYoutubeVisible: boolean("social_youtube_visible")
			.notNull()
			.default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		check("store_settings_singleton", sql`${table.id} = 'singleton'`),
		check(
			"insurance_policy_valid",
			sql`${table.shippingInsurancePolicy} IN ('none','cart_value')`
		),
		check(
			"insurance_cap_non_negative",
			sql`${table.shippingInsuranceCapAmount} >= 0`
		),
		check(
			"fill_factor_range",
			sql`${table.shippingFillFactor} > 0 AND ${table.shippingFillFactor} <= 1`
		),
		check("box_padding_non_negative", sql`${table.shippingBoxPaddingCm} >= 0`),
	]
);

export type StoreSettings = typeof storeSettings.$inferSelect;
export type NewStoreSettings = typeof storeSettings.$inferInsert;
