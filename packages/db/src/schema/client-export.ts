import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const clientExportLog = pgTable(
	"client_export_log",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		filters: jsonb("filters").notNull(),
		rowCount: integer("row_count").notNull(),
		bytesWritten: integer("bytes_written").notNull(),
		truncated: boolean("truncated").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("client_export_user_created_idx").on(
			table.userId,
			table.createdAt.desc()
		),
	]
);

export const clientExportLogRelations = relations(
	clientExportLog,
	({ one }) => ({
		user: one(user, {
			fields: [clientExportLog.userId],
			references: [user.id],
		}),
	})
);

export type ClientExportLog = typeof clientExportLog.$inferSelect;
export type NewClientExportLog = typeof clientExportLog.$inferInsert;
