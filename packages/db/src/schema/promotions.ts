import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

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
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
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

export const promotionRelations = relations(promotion, ({ many }) => ({
	promotionTools: many(promotionTool),
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
