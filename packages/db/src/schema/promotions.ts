import { relations } from "drizzle-orm";
import {
	boolean,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { tool } from "./tools";

export const promotion = pgTable("promotion", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	description: text("description"),
	toolId: text("tool_id").references(() => tool.id, { onDelete: "cascade" }),
	discountPct: numeric("discount_pct", { precision: 5, scale: 2 }),
	active: boolean("active").notNull().default(false),
	startsAt: timestamp("starts_at"),
	endsAt: timestamp("ends_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promotionRelations = relations(promotion, ({ one }) => ({
	tool: one(tool, {
		fields: [promotion.toolId],
		references: [tool.id],
	}),
}));

export type Promotion = typeof promotion.$inferSelect;
export type NewPromotion = typeof promotion.$inferInsert;
