import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./client";
import { actorTypeEnum } from "./shared-enums";

export const clientAuditActionEnum = pgEnum("client_audit_action", [
	"profile_updated",
	"status_changed",
	"type_changed",
	"notes_updated",
	"session_revoked",
	"sessions_revoked_all",
	"password_reset_link_generated",
	"exported",
]);
export type ClientAuditAction =
	(typeof clientAuditActionEnum.enumValues)[number];

export const clientAuditLog = pgTable(
	"client_audit_log",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		action: clientAuditActionEnum("action").notNull(),
		beforeJson: jsonb("before_json"),
		afterJson: jsonb("after_json"),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("client_audit_client_created_idx").on(
			table.clientId,
			table.createdAt.desc()
		),
		index("client_audit_action_created_idx").on(
			table.action,
			table.createdAt.desc()
		),
		check(
			"client_audit_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const clientAuditLogRelations = relations(clientAuditLog, ({ one }) => ({
	client: one(client, {
		fields: [clientAuditLog.clientId],
		references: [client.id],
	}),
	actorUser: one(user, {
		fields: [clientAuditLog.actorUserId],
		references: [user.id],
	}),
}));

export type ClientAuditLog = typeof clientAuditLog.$inferSelect;
export type NewClientAuditLog = typeof clientAuditLog.$inferInsert;
