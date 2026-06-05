import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tool } from "./tools";

export const promotion = pgTable(
	"promotion",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description"),
		type: text("type").notNull().default("promotion"),
		code: text("code").unique(),
		discountType: text("discount_type").notNull().default("percent"),
		discountValue: numeric("discount_value", {
			precision: 12,
			scale: 2,
		}).notNull(),
		appliesToAll: boolean("applies_to_all").notNull().default(false),
		maxRedemptions: integer("max_redemptions"),
		redemptionCount: integer("redemption_count").notNull().default(0),
		minOrderAmount: numeric("min_order_amount", { precision: 12, scale: 2 }),
		active: boolean("active").default(false).notNull(),
		startsAt: timestamp("starts_at"),
		endsAt: timestamp("ends_at"),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		updatedBy: text("updated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("promotion_created_idx").on(table.createdAt.desc(), table.id.desc()),
		// Dashboard: contagem/keyset de promoções ativas expirando (getDashboardKpis,
		// fetchExpiringPromotions). Parcial em active=true cobre o predicado quente.
		index("promotion_active_ends_idx")
			.on(table.endsAt)
			.where(sql`active = true`),
		check(
			"valid_promotion_type",
			sql`${table.type} IN ('promotion', 'promocode')`
		),
		check(
			"valid_discount_type",
			sql`${table.discountType} IN ('percent', 'fixed')`
		),
		check(
			"discount_coherent",
			sql`(${table.discountType} = 'percent' AND ${table.discountValue} > 0 AND ${table.discountValue} <= 100)
   OR (${table.discountType} = 'fixed' AND ${table.discountValue} > 0)`
		),
		check(
			"promo_no_coupon_fields",
			sql`${table.type} = 'promocode' OR (${table.maxRedemptions} IS NULL AND ${table.minOrderAmount} IS NULL)`
		),
		check("redemption_count_non_negative", sql`${table.redemptionCount} >= 0`),
		check(
			"ends_after_starts",
			sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
		),
	]
);

export const promotionTool = pgTable(
	"promotion_tool",
	{
		promotionId: text("promotion_id")
			.notNull()
			.references(() => promotion.id, { onDelete: "cascade" }),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.promotionId, table.toolId] })]
);

export const promotionRelations = relations(promotion, ({ many, one }) => ({
	promotionTools: many(promotionTool),
	createdByUser: one(user, {
		fields: [promotion.createdBy],
		references: [user.id],
		relationName: "promotion_created_by",
	}),
	updatedByUser: one(user, {
		fields: [promotion.updatedBy],
		references: [user.id],
		relationName: "promotion_updated_by",
	}),
}));

export const promotionToolRelations = relations(promotionTool, ({ one }) => ({
	promotion: one(promotion, {
		fields: [promotionTool.promotionId],
		references: [promotion.id],
	}),
	tool: one(tool, {
		fields: [promotionTool.toolId],
		references: [tool.id],
	}),
}));

export type Promotion = typeof promotion.$inferSelect;
export type NewPromotion = typeof promotion.$inferInsert;
export type PromotionTool = typeof promotionTool.$inferSelect;
export type NewPromotionTool = typeof promotionTool.$inferInsert;
