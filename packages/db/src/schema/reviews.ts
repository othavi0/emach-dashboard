import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./client";
import { order } from "./orders";
import { tool } from "./tools";

export const reviewStatusEnum = pgEnum("review_status", [
	"pending",
	"approved",
	"rejected",
	"spam",
]);
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];

export const review = pgTable(
	"review",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "restrict" }),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "restrict" }),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, {
				onDelete: "restrict",
			}),
		rating: integer("rating").notNull(),
		title: text("title"),
		body: text("body").notNull(),
		status: reviewStatusEnum("status").notNull().default("pending"),
		moderatedBy: text("moderated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		moderatedAt: timestamp("moderated_at"),
		moderationNote: text("moderation_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		check("rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
		// Ordem das colunas alinhada à declaração da tabela (tool, client, order):
		// drizzle-kit introspecta colunas de unique constraint em ordem de attnum;
		// se o .on() divergir, `db:push` gera um diff fantasma eterno.
		unique("review_client_tool_order_unique").on(
			table.toolId,
			table.clientId,
			table.orderId
		),
		index("review_tool_id_idx").on(table.toolId),
		index("review_status_created_idx").on(table.status, table.createdAt.desc()),
	]
);

export const reviewRelations = relations(review, ({ one }) => ({
	tool: one(tool, { fields: [review.toolId], references: [tool.id] }),
	client: one(client, { fields: [review.clientId], references: [client.id] }),
	order: one(order, { fields: [review.orderId], references: [order.id] }),
	moderator: one(user, {
		fields: [review.moderatedBy],
		references: [user.id],
	}),
}));

export type Review = typeof review.$inferSelect;
export type NewReview = typeof review.$inferInsert;
