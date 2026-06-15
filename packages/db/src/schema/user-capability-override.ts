import { relations } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userCapabilityOverride = pgTable(
	"user_capability_override",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// String livre (não enum DB): o registry em código é a fonte de verdade e
		// valida. Evita churn de enum no push-only quando caps mudam.
		capability: text("capability").notNull(),
		effect: text("effect", { enum: ["grant", "revoke"] }).notNull(),
		// Ator que aplicou. set null se o ator for deletado (padrão audit ADR-0011).
		grantedBy: text("granted_by").references(() => user.id, {
			onDelete: "set null",
		}),
		grantedAt: timestamp("granted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// PK composta (userId, capability) já provê btree com userId à esquerda —
		// dispensa índice separado em userId (lookups por userId usam a PK).
		primaryKey({ columns: [table.userId, table.capability] }),
	]
);

export const userCapabilityOverrideRelations = relations(
	userCapabilityOverride,
	({ one }) => ({
		user: one(user, {
			fields: [userCapabilityOverride.userId],
			references: [user.id],
		}),
	})
);

export type UserCapabilityOverride = typeof userCapabilityOverride.$inferSelect;
export type NewUserCapabilityOverride =
	typeof userCapabilityOverride.$inferInsert;
