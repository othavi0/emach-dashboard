import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { category } from "./categories";
import { tool } from "./tools";

export const attributeInputTypeEnum = pgEnum("attribute_input_type", [
	"text",
	"number",
	"select",
	"boolean",
	"numeric_range",
	"color",
]);
export type AttributeInputType =
	(typeof attributeInputTypeEnum.enumValues)[number];

interface SelectOption {
	label: string;
	value: string;
}
interface ColorSwatch {
	hex: string;
	label: string;
	value: string;
}
export type AttributeOptions =
	| { kind: "select"; options: SelectOption[] }
	| { kind: "color"; swatches: ColorSwatch[] };

export const attributeDefinition = pgTable(
	"attribute_definition",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull().unique(),
		label: text("label").notNull(),
		inputType: attributeInputTypeEnum("input_type").notNull(),
		unit: text("unit"),
		options: jsonb("options").$type<AttributeOptions>(),
		isRequired: boolean("is_required").notNull().default(false),
		categoryId: text("category_id")
			.notNull()
			.references(() => category.id, {
				onDelete: "restrict",
			}),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("attribute_definition_category_idx").on(table.categoryId),
		index("attribute_definition_input_type_idx").on(table.inputType),
	]
);

export const toolAttributeValue = pgTable(
	"tool_attribute_value",
	{
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		attributeId: text("attribute_id")
			.notNull()
			.references(() => attributeDefinition.id, { onDelete: "cascade" }),
		valueText: text("value_text"),
		valueNumeric: numeric("value_numeric", { precision: 14, scale: 4 }),
		valueNumericMax: numeric("value_numeric_max", { precision: 14, scale: 4 }),
		valueBool: boolean("value_bool"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.toolId, table.attributeId] }),
		index("tool_attribute_value_attribute_idx").on(
			table.attributeId,
			table.valueNumeric
		),
		index("tool_attribute_value_attribute_text_idx").on(
			table.attributeId,
			table.valueText
		),
		check(
			"value_at_least_one",
			sql`${table.valueText} IS NOT NULL OR ${table.valueNumeric} IS NOT NULL OR ${table.valueBool} IS NOT NULL`
		),
		check(
			"numeric_range_order",
			sql`${table.valueNumericMax} IS NULL OR (${table.valueNumeric} IS NOT NULL AND ${table.valueNumericMax} >= ${table.valueNumeric})`
		),
	]
);

export const attributeDefinitionRelations = relations(
	attributeDefinition,
	({ one, many }) => ({
		category: one(category, {
			fields: [attributeDefinition.categoryId],
			references: [category.id],
		}),
		values: many(toolAttributeValue),
	})
);

export const toolAttributeValueRelations = relations(
	toolAttributeValue,
	({ one }) => ({
		tool: one(tool, {
			fields: [toolAttributeValue.toolId],
			references: [tool.id],
		}),
		attribute: one(attributeDefinition, {
			fields: [toolAttributeValue.attributeId],
			references: [attributeDefinition.id],
		}),
	})
);

export const toolAttributeAssignment = pgTable(
	"tool_attribute_assignment",
	{
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		attributeId: text("attribute_id").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.toolId, table.attributeId] }),
		index("tool_attribute_assignment_tool_idx").on(table.toolId),
		// FK nomeada explicitamente: o nome auto-gerado pelo drizzle
		// (tool_attribute_assignment_attribute_id_attribute_definition_id_fk)
		// excede 63 chars, Postgres trunca, e db:push gera diff fantasma eterno.
		foreignKey({
			columns: [table.attributeId],
			foreignColumns: [attributeDefinition.id],
			name: "tool_attribute_assignment_attribute_id_fk",
		}).onDelete("cascade"),
	]
);

export const toolAttributeAssignmentRelations = relations(
	toolAttributeAssignment,
	({ one }) => ({
		tool: one(tool, {
			fields: [toolAttributeAssignment.toolId],
			references: [tool.id],
		}),
		attribute: one(attributeDefinition, {
			fields: [toolAttributeAssignment.attributeId],
			references: [attributeDefinition.id],
		}),
	})
);

export type AttributeDefinition = typeof attributeDefinition.$inferSelect;
export type NewAttributeDefinition = typeof attributeDefinition.$inferInsert;
export type ToolAttributeValue = typeof toolAttributeValue.$inferSelect;
export type NewToolAttributeValue = typeof toolAttributeValue.$inferInsert;
export type ToolAttributeAssignment =
	typeof toolAttributeAssignment.$inferSelect;
export type NewToolAttributeAssignment =
	typeof toolAttributeAssignment.$inferInsert;
