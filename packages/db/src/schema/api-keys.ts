import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const apiKey = pgTable(
	"api_key",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		keyHash: text("key_hash").unique().notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
		allowedTags: text("allowed_tags")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		index("api_key_key_hash_idx").on(table.keyHash),
		index("api_key_scopes_idx").using("gin", table.scopes),
	]
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
	user: one(user, {
		fields: [apiKey.userId],
		references: [user.id],
	}),
}));

export type ApiKey = typeof apiKey.$inferSelect;
export type NewApiKey = typeof apiKey.$inferInsert;
