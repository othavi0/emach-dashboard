import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { client } from "./client";

export const consentKindEnum = pgEnum("consent_kind", [
	"tos",
	"privacy",
	"marketing_email",
	"cookies",
]);
export type ConsentKind = (typeof consentKindEnum.enumValues)[number];

export const consentActorEnum = pgEnum("consent_actor", ["client", "lead"]);
export type ConsentActor = (typeof consentActorEnum.enumValues)[number];

export const consentLog = pgTable(
	"consent_log",
	{
		id: text("id").primaryKey(),
		actorType: consentActorEnum("actor_type").notNull(),
		clientId: text("client_id").references(() => client.id, {
			onDelete: "cascade",
		}),
		leadId: text("lead_id"), // FK na Fase C quando lead existir
		kind: consentKindEnum("kind").notNull(),
		granted: boolean("granted").notNull(),
		version: text("version").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		grantedAt: timestamp("granted_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		check(
			"consent_actor_coherence",
			sql`(${table.actorType} = 'client' AND ${table.clientId} IS NOT NULL AND ${table.leadId} IS NULL)
				OR (${table.actorType} = 'lead' AND ${table.leadId} IS NOT NULL AND ${table.clientId} IS NULL)`
		),
		index("consent_log_client_idx").on(
			table.clientId,
			table.kind,
			table.grantedAt.desc()
		),
		index("consent_log_lead_idx").on(
			table.leadId,
			table.kind,
			table.grantedAt.desc()
		),
	]
);

export const consentLogRelations = relations(consentLog, ({ one }) => ({
	client: one(client, {
		fields: [consentLog.clientId],
		references: [client.id],
	}),
}));

export type ConsentLog = typeof consentLog.$inferSelect;
export type NewConsentLog = typeof consentLog.$inferInsert;
