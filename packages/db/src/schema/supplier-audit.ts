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
import { actorTypeEnum } from "./shared-enums";
import { supplier } from "./tools";

export const supplierAuditActionEnum = pgEnum("supplier_audit_action", [
	"created",
	"profile_updated",
	"deleted",
	"restored",
]);
export type SupplierAuditAction =
	(typeof supplierAuditActionEnum.enumValues)[number];

export const supplierAuditLog = pgTable(
	"supplier_audit_log",
	{
		id: text("id").primaryKey(),
		supplierId: text("supplier_id")
			.notNull()
			.references(() => supplier.id, { onDelete: "cascade" }),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		action: supplierAuditActionEnum("action").notNull(),
		beforeJson: jsonb("before_json"),
		afterJson: jsonb("after_json"),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("supplier_audit_supplier_created_idx").on(
			table.supplierId,
			table.createdAt.desc()
		),
		index("supplier_audit_action_created_idx").on(
			table.action,
			table.createdAt.desc()
		),
		check(
			"supplier_audit_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const supplierAuditLogRelations = relations(
	supplierAuditLog,
	({ one }) => ({
		supplier: one(supplier, {
			fields: [supplierAuditLog.supplierId],
			references: [supplier.id],
		}),
		actorUser: one(user, {
			fields: [supplierAuditLog.actorUserId],
			references: [user.id],
		}),
	})
);

export type SupplierAuditLog = typeof supplierAuditLog.$inferSelect;
export type NewSupplierAuditLog = typeof supplierAuditLog.$inferInsert;
