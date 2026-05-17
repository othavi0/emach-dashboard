import { relations } from "drizzle-orm";
import {
	boolean,
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

export const consentLog = pgTable(
	"consent_log",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
		kind: consentKindEnum("kind").notNull(),
		granted: boolean("granted").notNull(),
		version: text("version").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		grantedAt: timestamp("granted_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		index("consent_log_client_idx").on(
			table.clientId,
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
