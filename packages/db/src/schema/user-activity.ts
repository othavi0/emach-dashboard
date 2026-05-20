import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userActivityLog = pgTable(
	"user_activity_log",
	{
		id: text("id").primaryKey(),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		targetType: text("target_type"),
		targetId: text("target_id"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("user_activity_actor_created_idx").on(
			table.actorUserId,
			table.createdAt.desc()
		),
		index("user_activity_target_idx").on(table.targetType, table.targetId),
		index("user_activity_action_created_idx").on(
			table.action,
			table.createdAt.desc()
		),
	]
);

export const userActivityLogRelations = relations(
	userActivityLog,
	({ one }) => ({
		actorUser: one(user, {
			fields: [userActivityLog.actorUserId],
			references: [user.id],
		}),
	})
);

export type UserActivityLog = typeof userActivityLog.$inferSelect;
export type NewUserActivityLog = typeof userActivityLog.$inferInsert;
