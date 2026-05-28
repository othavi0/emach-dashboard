import crypto from "node:crypto";
import { db } from "@emach/db";
import {
	REVENUE_ORDER_STATUSES,
	sqlStatusList,
} from "@emach/db/order-status-groups";
import { clientExportLog } from "@emach/db/schema/client-export";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";
import { formatDocument } from "@/lib/cpf-cnpj";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { customersListFiltersSchema } from "../schema";

const MAX_ROWS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;
const BOM = "﻿";

const COLUMNS = [
	"id",
	"name",
	"email",
	"document_formatted",
	"phone",
	"client_type",
	"status",
	"created_at",
	"last_seen_at",
	"ltv",
	"orders_count",
	"last_order_at",
] as const;

const CSV_NEEDS_QUOTING_RE = /[",\n\r]/;
const CSV_QUOTE_RE = /"/g;

function escapeCsvField(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = value instanceof Date ? value.toISOString() : String(value);
	if (CSV_NEEDS_QUOTING_RE.test(str)) {
		return `"${str.replace(CSV_QUOTE_RE, '""')}"`;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streaming CSV with filter assembly + audit emission inline for single-pass throughput
export async function GET(req: Request) {
	const session = await requireCapability("customers.export");

	const raw = parseSearchParams(req);
	const parsed = customersListFiltersSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response("Invalid filters", { status: 400 });
	}
	const filters = parsed.data;

	const conditions: ReturnType<typeof sql>[] = [];

	if (filters.q?.trim()) {
		const like = `%${filters.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
		conditions.push(
			sql`(c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.document ILIKE ${like})`
		);
	}
	if (filters.status) {
		conditions.push(sql`c.status = ${filters.status}`);
	}
	if (filters.clientType?.length) {
		const ph = sql.join(
			filters.clientType.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`c.client_type IN (${ph})`);
	}
	if (filters.createdFrom) {
		conditions.push(sql`c.created_at >= ${filters.createdFrom}::date`);
	}
	if (filters.createdTo) {
		conditions.push(
			sql`c.created_at < (${filters.createdTo}::date + INTERVAL '1 day')`
		);
	}
	if (filters.ltvMin !== undefined) {
		conditions.push(sql`COALESCE(stats.ltv, 0) >= ${filters.ltvMin}`);
	}
	if (filters.ltvMax !== undefined) {
		conditions.push(sql`COALESCE(stats.ltv, 0) <= ${filters.ltvMax}`);
	}

	const where = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const stream = new ReadableStream<Uint8Array>({
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streaming start handler aggregates row formatting + truncation flag + audit insert
		async start(controller) {
			const encoder = new TextEncoder();
			let bytes = 0;
			let rows = 0;
			let truncated = false;

			const enqueueLine = (line: string): boolean => {
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
					id: string;
					name: string;
					email: string;
					document: string | null;
					phone: string | null;
					client_type: string | null;
					status: string;
					created_at: Date;
					last_seen_at: Date | null;
					ltv: string | null;
					orders_count: number | null;
					last_order_at: Date | null;
				}>(sql`
					WITH order_stats AS (
						SELECT
							o.client_id,
							SUM(CASE WHEN o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)}) THEN o.total_amount ELSE 0 END)::numeric AS ltv,
							COUNT(*)::int AS orders_count,
							MAX(o.created_at) AS last_order_at
						FROM "order" o
						GROUP BY o.client_id
					)
					SELECT
						c.id, c.name, c.email, c.document, c.phone,
						c.client_type, c.status, c.created_at, c.last_seen_at,
						stats.ltv, stats.orders_count, stats.last_order_at
					FROM client c
					LEFT JOIN order_stats stats ON stats.client_id = c.id
					${where}
					ORDER BY c.created_at DESC
					LIMIT ${MAX_ROWS}
				`);

				for (const r of result.rows) {
					if (++rows > MAX_ROWS) {
						truncated = true;
						break;
					}
					const ok = enqueueLine(
						encodeRow([
							r.id,
							r.name,
							r.email,
							r.document ? formatDocument(r.document) : "",
							r.phone ?? "",
							r.client_type ?? "",
							r.status,
							toDate(r.created_at)?.toISOString() ?? "",
							toDate(r.last_seen_at)?.toISOString() ?? "",
							r.ltv ? Number(r.ltv) : 0,
							r.orders_count ?? 0,
							toDate(r.last_order_at)?.toISOString() ?? "",
						])
					);
					if (!ok) {
						break;
					}
				}

				// Log export
				try {
					await db.insert(clientExportLog).values({
						id: crypto.randomUUID(),
						userId: session.user.id,
						filters: filters as Record<string, unknown>,
						rowCount: rows,
						bytesWritten: bytes,
						truncated,
					});
				} catch (logErr) {
					logger.error("customers.csv_export.log_failed", logErr);
				}

				logger.info("customers.csv_export", {
					userId: session.user.id,
					count: rows,
					bytes,
					truncated,
				});
			} catch (err) {
				logger.error("customers.csv_export", err);
				controller.error(err);
				return;
			}

			controller.close();
		},
	});

	const filename = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
	return new Response(stream, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
