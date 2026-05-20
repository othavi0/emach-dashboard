import { relations } from "drizzle-orm";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userActivityLog = pgTable(
	"user_activity_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
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
		actor: one(user, {
			fields: [userActivityLog.actorUserId],
			references: [user.id],
		}),
	})
);

export type UserActivityLogRow = typeof userActivityLog.$inferSelect;
export type UserActivityLogInsert = typeof userActivityLog.$inferInsert;
