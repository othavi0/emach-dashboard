import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { type SQL, sql } from "drizzle-orm";

import {
	getUserBranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	buildOrdersListConditions,
	normalizeDateParam,
	resolveTab,
} from "../_lib/orders-where";
import { ordersListFiltersSchema } from "../schema";

const MAX_ROWS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;
const BOM = "﻿";

const CSV_NEEDS_QUOTING = /[",\n\r]/;
const CSV_QUOTE = /"/g;

const COLUMNS = [
	"number",
	"created_at",
	"status",
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
	if (CSV_NEEDS_QUOTING.test(str)) {
		return `"${str.replace(CSV_QUOTE, '""')}"`;
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

	const scope = await getUserBranchScope(session);
	if (isBlindScope(scope)) {
		return new Response("", {
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
				"Cache-Control": "no-store",
			},
		});
	}

	const raw = parseSearchParams(req);
	const parsed = ordersListFiltersSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response("Invalid filters", { status: 400 });
	}
	const filters = parsed.data;

	const conditions: SQL[] = [];
	const branchCond = orderBranchCondition(scope);

	// Export de selecionados: IDs explícitos substituem os filtros de listagem.
	const selectedIds = filters.ids
		? filters.ids
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];

	if (selectedIds.length > 0) {
		if (branchCond) {
			conditions.push(branchCond);
		}
		const placeholders = sql.join(
			selectedIds.map((id) => sql`${id}`),
			sql`, `
		);
		conditions.push(sql`o.id IN (${placeholders})`);
	} else {
		const tab = resolveTab(filters.tab);
		conditions.push(
			...buildOrdersListConditions({
				filters: {
					q: filters.q,
					branchId: filters.branchId,
					carrier: filters.carrier,
					toolId: filters.productId,
					from: normalizeDateParam(filters.from),
					to: normalizeDateParam(filters.to),
					lateStatus: filters.lateStatus,
				},
				scope,
				tabDef: tab,
			})
		);
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
