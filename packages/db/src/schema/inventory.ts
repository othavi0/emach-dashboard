import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { toolVariant } from "./tools";

export interface BranchBusinessHoursPeriod {
	closesAt: string | null;
	isOpen: boolean;
	opensAt: string | null;
}

export interface BranchBusinessHours {
	holidays: BranchBusinessHoursPeriod;
	saturday: BranchBusinessHoursPeriod;
	weekdays: BranchBusinessHoursPeriod;
}

export const branch = pgTable(
	"branch",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		phone: text("phone"),
		businessHours: jsonb("business_hours").$type<BranchBusinessHours>(),
		// Endereço estruturado (substitui address legacy)
		cep: text("cep"),
		street: text("street"),
		streetNumber: text("street_number"),
		complement: text("complement"),
		neighborhood: text("neighborhood"),
		city: text("city"),
		state: varchar("state", { length: 2 }),
		status: text("status", { enum: ["active", "inactive"] })
			.default("active")
			.notNull(),
		responsibleUserId: text("responsible_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cepRanges: jsonb("cep_ranges").$type<Array<{ from: string; to: string }>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("branch_created_idx").on(table.createdAt.desc(), table.id.desc()),
	]
);

export const stockLevel = pgTable(
	"stock_level",
	{
		variantId: text("variant_id")
			.notNull()
			.references(() => toolVariant.id, { onDelete: "cascade" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "cascade" }),
		quantity: integer("quantity").notNull().default(0),
		minQty: integer("min_qty").notNull().default(0),
		reorderPoint: integer("reorder_point").notNull().default(0),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.variantId, table.branchId] }),
		index("stock_level_variant_id_idx").on(table.variantId),
		index("stock_level_branch_id_idx").on(table.branchId),
		check("min_qty_non_negative", sql`${table.minQty} >= 0`),
		check("reorder_point_non_negative", sql`${table.reorderPoint} >= 0`),
		check("reorder_gte_min", sql`${table.reorderPoint} >= ${table.minQty}`),
		check("quantity_non_negative", sql`${table.quantity} >= 0`),
	]
);

export const branchRelations = relations(branch, ({ many }) => ({
	stockLevels: many(stockLevel),
	userBranches: many(userBranch),
}));

export const stockLevelRelations = relations(stockLevel, ({ one }) => ({
	variant: one(toolVariant, {
		fields: [stockLevel.variantId],
		references: [toolVariant.id],
	}),
	branch: one(branch, {
		fields: [stockLevel.branchId],
		references: [branch.id],
	}),
}));

export const userBranch = pgTable(
	"user_branch",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.branchId] }),
		index("user_branch_user_idx").on(table.userId),
		index("user_branch_branch_idx").on(table.branchId),
	]
);

export const userBranchesRelations = relations(user, ({ many }) => ({
	branches: many(userBranch),
}));

export const userBranchRelations = relations(userBranch, ({ one }) => ({
	user: one(user, {
		fields: [userBranch.userId],
		references: [user.id],
	}),
	branch: one(branch, {
		fields: [userBranch.branchId],
		references: [branch.id],
	}),
}));

export type Branch = typeof branch.$inferSelect;
export type NewBranch = typeof branch.$inferInsert;
export type StockLevel = typeof stockLevel.$inferSelect;
export type NewStockLevel = typeof stockLevel.$inferInsert;
export type UserBranch = typeof userBranch.$inferSelect;
export type NewUserBranch = typeof userBranch.$inferInsert;
