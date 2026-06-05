import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
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
	]
);

export type StoreSettings = typeof storeSettings.$inferSelect;
export type NewStoreSettings = typeof storeSettings.$inferInsert;
