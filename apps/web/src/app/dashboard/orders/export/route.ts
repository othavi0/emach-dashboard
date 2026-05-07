import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { ordersListFiltersSchema } from "../schema";
import { ORDER_TABS } from "../status-meta";

const MAX_ROWS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;
const BOM = "﻿";

const COLUMNS = [
	"number",
	"created_at",
	"status",
	"payment_status",
	"client_name",
	"client_email",
	"client_document",
	"branch_name",
	"subtotal",
	"discount",
	"shipping",
	"total",
	"item_count",
] as const;

function escapeCsvField(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = value instanceof Date ? value.toISOString() : String(value);
	if (/[",\n\r]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function encodeRow(row: readonly unknown[]): string {
	return `${row.map(escapeCsvField).join(",")}\n`;
}

interface RawSearchParams {
	[k: string]: string | string[] | undefined;
}

function parseSearchParams(req: Request): RawSearchParams {
	const url = new URL(req.url);
	const out: RawSearchParams = {};
	for (const [k, v] of url.searchParams.entries()) {
		const existing = out[k];
		if (Array.isArray(existing)) {
			existing.push(v);
		} else if (typeof existing === "string") {
			out[k] = [existing, v];
		} else {
			out[k] = v;
		}
	}
	return out;
}

export async function GET(req: Request) {
	const session = await requireCapability("orders.export");

	const raw = parseSearchParams(req);
	const parsed = ordersListFiltersSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response("Invalid filters", { status: 400 });
	}
	const filters = parsed.data;

	const conditions = [] as ReturnType<typeof sql>[];
	const tab = ORDER_TABS.find((t) => t.key === filters.tab);
	if (tab?.statuses) {
		const placeholders = sql.join(
			tab.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (filters.q) {
		const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
		conditions.push(
			sql`(o.number ILIKE ${like} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.document ILIKE ${like})`
		);
	}
	if (filters.branchId) {
		conditions.push(sql`o.branch_id = ${filters.branchId}`);
	}
	if (filters.from) {
		conditions.push(sql`o.created_at >= ${filters.from}::date`);
	}
	if (filters.to) {
		conditions.push(
			sql`o.created_at < (${filters.to}::date + INTERVAL '1 day')`
		);
	}
	if (filters.paymentStatus) {
		conditions.push(sql`o.payment_status = ${filters.paymentStatus}`);
	}
	const where = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			let bytes = 0;
			let rows = 0;
			let truncated = false;

			const enqueueLine = (line: string) => {
				const buf = encoder.encode(line);
				if (bytes + buf.byteLength > MAX_BYTES) {
					truncated = true;
					return false;
				}
				bytes += buf.byteLength;
				controller.enqueue(buf);
				return true;
			};

			enqueueLine(BOM);
			enqueueLine(encodeRow(COLUMNS));

			try {
				const result = await db.execute<{
					number: string;
					created_at: Date;
					status: string;
					payment_status: string;
					client_name: string;
					client_email: string;
					client_document: string | null;
					branch_name: string | null;
					subtotal_amount: string;
					discount_amount: string;
					shipping_amount: string;
					total_amount: string;
					item_count: number;
				}>(sql`
					SELECT
						o.number,
						o.created_at,
						o.status,
						o.payment_status,
						c.name AS client_name,
						c.email AS client_email,
						c.document AS client_document,
						b.name AS branch_name,
						o.subtotal_amount,
						o.discount_amount,
						o.shipping_amount,
						o.total_amount,
						COALESCE((SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id), 0) AS item_count
					FROM "order" o
					JOIN client c ON c.id = o.client_id
					LEFT JOIN branch b ON b.id = o.branch_id
					${where}
					ORDER BY o.created_at DESC
					LIMIT ${MAX_ROWS}
				`);

				for (const r of result.rows) {
					if (++rows > MAX_ROWS) {
						truncated = true;
						break;
					}
					const ok = enqueueLine(
						encodeRow([
							r.number,
							toDate(r.created_at),
							r.status,
							r.payment_status,
							r.client_name,
							r.client_email,
							r.client_document,
							r.branch_name,
							r.subtotal_amount,
							r.discount_amount,
							r.shipping_amount,
							r.total_amount,
							r.item_count,
						])
					);
					if (!ok) {
						break;
					}
				}

				logger.info("orders.csv_export", {
					userId: session.user.id,
					count: rows,
					bytes,
					truncated,
					filters,
				});
			} catch (err) {
				logger.error("orders.csv_export", err);
				controller.error(err);
				return;
			}
			controller.close();
		},
	});

	const filename = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
	return new Response(stream, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
