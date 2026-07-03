// packages/db/scripts/seed/truncate.ts
import { sql } from "drizzle-orm";
import type { Tx } from "./context";

// 29 tabelas demo — NÃO inclui user/account/session/verification (auth do dashboard).
const DEMO_TABLES = [
	"branch",
	"user_branch",
	"supplier",
	"category",
	"attribute_definition",
	"tool",
	"tool_variant",
	"tool_image",
	"tool_category",
	"tool_attribute_value",
	"tool_attribute_assignment",
	"stock_level",
	"stock_movement",
	"client",
	"client_address",
	"client_account",
	"client_session",
	"client_verification",
	"consent_log",
	"client_audit_log",
	"client_export_log",
	"order",
	"order_item",
	"order_status_history",
	"order_note",
	"review",
	"promotion",
	"promotion_tool",
	"cart_event",
	"shipping_box",
] as const;

export async function truncateDemo(tx: Tx): Promise<void> {
	const list = DEMO_TABLES.map((t) => `"${t}"`).join(", ");
	await tx.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}
