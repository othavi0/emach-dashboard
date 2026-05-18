import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
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
		discountPct: numeric("discount_pct", {
			precision: 5,
			scale: 2,
		}).notNull(),
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
		check(
			"valid_promotion_type",
			sql`${table.type} IN ('promotion', 'promocode')`
		),
		check(
			"discount_pct_range",
			sql`${table.discountPct} > 0 AND ${table.discountPct} <= 100`
		),
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
