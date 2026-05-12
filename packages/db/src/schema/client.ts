import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const clientStatusEnum = pgEnum("client_status", [
	"active",
	"inactive",
	"blocked",
]);
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number];

export const clientTypeEnum = pgEnum("client_type", ["b2c", "b2b"]);
export type ClientType = (typeof clientTypeEnum.enumValues)[number];

export const client = pgTable(
	"client",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		phone: text("phone"),
		document: text("document").unique(),
		status: clientStatusEnum("status").default("active").notNull(),
		clientType: clientTypeEnum("client_type"),
		internalNotes: text("internal_notes"),
		lastSeenAt: timestamp("last_seen_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("client_status_idx").on(table.status),
		index("client_type_idx").on(table.clientType),
		index("client_created_idx").on(table.createdAt.desc(), table.id.desc()),
		index("client_last_seen_idx").on(table.lastSeenAt.desc()),
	]
);

export const clientSession = pgTable(
	"client_session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
	},
	(table) => [index("client_session_userId_idx").on(table.userId)]
);

export const clientAccount = pgTable(
	"client_account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("client_account_userId_idx").on(table.userId)]
);

export const clientVerification = pgTable(
	"client_verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("client_verification_identifier_idx").on(table.identifier)]
);

export const clientAddress = pgTable(
	"client_address",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
		label: text("label"),
		recipient: text("recipient").notNull(),
		zipCode: text("zip_code").notNull(),
		street: text("street").notNull(),
		number: text("number").notNull(),
		complement: text("complement"),
		neighborhood: text("neighborhood").notNull(),
		city: text("city").notNull(),
		state: text("state").notNull(),
		country: text("country").default("BR").notNull(),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("client_address_clientId_idx").on(table.clientId)]
);

export const clientRelations = relations(client, ({ many }) => ({
	sessions: many(clientSession),
	accounts: many(clientAccount),
	addresses: many(clientAddress),
}));

export const clientSessionRelations = relations(clientSession, ({ one }) => ({
	client: one(client, {
		fields: [clientSession.userId],
		references: [client.id],
	}),
}));

export const clientAccountRelations = relations(clientAccount, ({ one }) => ({
	client: one(client, {
		fields: [clientAccount.userId],
		references: [client.id],
	}),
}));

export const clientAddressRelations = relations(clientAddress, ({ one }) => ({
	client: one(client, {
		fields: [clientAddress.clientId],
		references: [client.id],
	}),
}));

export type Client = typeof client.$inferSelect;
export type NewClient = typeof client.$inferInsert;
export type ClientSession = typeof clientSession.$inferSelect;
export type NewClientSession = typeof clientSession.$inferInsert;
export type ClientAccount = typeof clientAccount.$inferSelect;
export type NewClientAccount = typeof clientAccount.$inferInsert;
export type ClientVerification = typeof clientVerification.$inferSelect;
export type NewClientVerification = typeof clientVerification.$inferInsert;
export type ClientAddress = typeof clientAddress.$inferSelect;
export type NewClientAddress = typeof clientAddress.$inferInsert;
