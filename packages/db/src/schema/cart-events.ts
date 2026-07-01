import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { client } from "./client";
import { tool, toolVariant } from "./tools";

// Evento bruto de "adicionar ao carrinho" no ecommerce (1 linha por clique).
// INSERT-only pelo app ecommerce; dashboard lê (janelas 15/30/90) e expurga
// >180d via cron. Sem colunas de actor — escrita é sempre system-side.
export const cartEvent = pgTable(
	"cart_event",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		// set null: deletar variante preserva o histórico de demanda do tool.
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		clientId: text("client_id").references(() => client.id, {
			onDelete: "set null",
		}),
		sessionId: text("session_id").notNull(),
		quantity: integer("quantity").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("cart_event_tool_created_idx").on(
			table.toolId,
			table.createdAt.desc()
		),
		index("cart_event_created_idx").on(table.createdAt),
		check("cart_event_quantity_positive", sql`${table.quantity} > 0`),
	]
);

export const cartEventRelations = relations(cartEvent, ({ one }) => ({
	tool: one(tool, { fields: [cartEvent.toolId], references: [tool.id] }),
}));

export type CartEvent = typeof cartEvent.$inferSelect;
export type NewCartEvent = typeof cartEvent.$inferInsert;
