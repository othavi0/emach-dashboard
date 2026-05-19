import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";

export interface DashboardCounts {
	orders: number;
	reviews: number;
	stock: number;
}

export async function fetchPendingStock(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "pendingStock") : null;
	const keyset = decoded
		? sql`AND (sl.quantity, sl.variant_id || ':' || sl.branch_id) > (${decoded.quantity}, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		branch_id: string;
		branch_name: string;
		quantity: number;
		sku: string | null;
		tool_name: string;
		variant_id: string;
	}>(sql`
		SELECT sl.variant_id, sl.branch_id, sl.quantity,
			tv.sku, t.name AS tool_name, b.name AS branch_name
		FROM stock_level sl
		JOIN tool_variant tv ON tv.id = sl.variant_id
		JOIN tool t ON t.id = tv.tool_id
		JOIN branch b ON b.id = sl.branch_id
		WHERE (sl.quantity = 0 OR (sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point))
		${keyset}
		ORDER BY sl.quantity ASC, sl.variant_id || ':' || sl.branch_id ASC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: `${r.variant_id}:${r.branch_id}`,
			href: "/dashboard/stock",
			primary: r.sku ?? r.tool_name,
			secondary: `${r.tool_name} · ${r.branch_name}`,
			badge:
				r.quantity === 0
					? { label: "Sem estoque", role: "destructive" }
					: { label: "Repor", role: "warning" },
		}),
		(last) => ({
			v: 1,
			sort: "pendingStock",
			quantity: last.quantity,
			id: `${last.variant_id}:${last.branch_id}`,
		})
	);
}

export async function fetchPendingOrders(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = decoded
		? sql`AND (o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		client_name: string;
		created_at: Date;
		id: string;
		number: string;
		status: string;
	}>(sql`
		SELECT o.id, o.number, o.status, o.created_at, c.name AS client_name
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		WHERE o.status IN ('paid', 'preparing', 'shipped')
		${keyset}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	const badgeFor = (status: string): NonNullable<PendingRow["badge"]> => {
		if (status === "paid") {
			return { label: "Pago", role: "warning" };
		}
		if (status === "preparing") {
			return { label: "Preparando", role: "info" };
		}
		return { label: "Enviado", role: "info" };
	};
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: badgeFor(r.status),
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchPendingReviews(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = decoded
		? sql`AND (r.created_at, r.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		created_at: Date;
		id: string;
		rating: number;
		tool_name: string | null;
	}>(sql`
		SELECT r.id, r.rating, r.created_at, t.name AS tool_name
		FROM review r
		LEFT JOIN tool t ON t.id = r.tool_id
		WHERE r.status = 'pending'
		${keyset}
		ORDER BY r.created_at DESC, r.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/reviews/${r.id}`,
			primary: `Review ${r.rating}★`,
			secondary: r.tool_name ?? "ferramenta",
			badge: { label: "Moderar", role: "warning" },
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchDashboardActivity(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = (col: string, idExpr: string) =>
		decoded
			? sql`WHERE (${sql.raw(col)}, ${sql.raw(idExpr)}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			: sql``;
	const result = await db.execute<{
		created_at: Date;
		href: string | null;
		id: string;
		kind: "order" | "review" | "stock";
		primary: string;
		secondary: string | null;
	}>(sql`
		(
			SELECT 'stock-' || sm.id AS id, 'stock'::text AS kind, sm.created_at,
				CASE WHEN sm.delta > 0 THEN '+' || sm.delta || ' un. ' || COALESCE(tv.sku, 'variante')
					ELSE sm.delta || ' un. ' || COALESCE(tv.sku, 'variante') END AS primary,
				COALESCE(b.name, '—') AS secondary, NULL::text AS href
			FROM stock_movement sm
			LEFT JOIN tool_variant tv ON tv.id = sm.variant_id
			LEFT JOIN branch b ON b.id = sm.branch_id
			${keyset("sm.created_at", "'stock-' || sm.id")}
			ORDER BY sm.created_at DESC, 'stock-' || sm.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'order-' || osh.id AS id, 'order'::text AS kind, osh.created_at,
				'#' || o.number || ' → ' || osh.to_status::text AS primary,
				NULL::text AS secondary, '/dashboard/orders/' || o.id AS href
			FROM order_status_history osh
			JOIN "order" o ON o.id = osh.order_id
			${keyset("osh.created_at", "'order-' || osh.id")}
			ORDER BY osh.created_at DESC, 'order-' || osh.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'review-' || r.id AS id, 'review'::text AS kind, r.created_at,
				'Review ' || r.rating || '★ · ' || COALESCE(t.name, 'ferramenta') AS primary,
				r.status::text AS secondary, '/dashboard/reviews/' || r.id AS href
			FROM review r
			LEFT JOIN tool t ON t.id = r.tool_id
			${keyset("r.created_at", "'review-' || r.id")}
			ORDER BY r.created_at DESC, 'review-' || r.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		ORDER BY created_at DESC, id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: r.kind,
			at: toDate(r.created_at),
			primary: r.primary,
			secondary: r.secondary ?? undefined,
			href: r.href ?? undefined,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
	await requireCurrentSession();
	const result = await db.execute<{
		orders: number;
		reviews: number;
		stock: number;
	}>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM stock_level
				WHERE quantity = 0 OR (reorder_point > 0 AND quantity <= reorder_point)) AS stock,
			(SELECT COUNT(*)::int FROM "order" WHERE status IN ('paid', 'preparing', 'shipped')) AS orders,
			(SELECT COUNT(*)::int FROM review WHERE status = 'pending') AS reviews
	`);
	const row = result.rows[0];
	if (!row) {
		throw new Error("fetchDashboardCounts: query retornou 0 linhas");
	}
	return row;
}
