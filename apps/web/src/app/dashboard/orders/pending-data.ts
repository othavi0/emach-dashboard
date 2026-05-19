import { db } from "@emach/db";
import type { OrderStatus } from "@emach/db/schema/orders";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import { ORDER_STATUS_LABELS } from "./status-meta";

const PENDING_ORDER_BADGE: Record<string, NonNullable<PendingRow["badge"]>> = {
	pending_payment: { label: "Aguardando pgto", role: "warning" },
	paid: { label: "Pago", role: "warning" },
	preparing: { label: "Preparando", role: "info" },
	shipped: { label: "Enviado", role: "info" },
};

export async function fetchPendingOrdersPage({
	statuses,
	cursor,
}: {
	statuses: OrderStatus[];
	cursor: string | null;
}): Promise<InfiniteResult<PendingRow>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (scope !== null && scope.length === 0) {
		return { items: [], nextCursor: null };
	}
	const conditions = [
		sql`o.status IN (${sql.join(
			statuses.map((s) => sql`${s}`),
			sql`, `
		)})`,
	];
	if (scope !== null) {
		conditions.push(
			sql`o.branch_id IN (${sql.join(
				scope.map((id) => sql`${id}`),
				sql`, `
			)})`
		);
	}
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(o.created_at, o.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		client_name: string;
		created_at: Date;
		id: string;
		number: string;
		status: OrderStatus;
	}>(sql`
		SELECT o.id, o.number, o.status, o.created_at, c.name AS client_name
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: PENDING_ORDER_BADGE[r.status] ?? {
				label: r.status,
				role: "info",
			},
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchOrderActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const conditions = [sql`TRUE`];
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(osh.created_at, osh.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		created_at: Date;
		id: string;
		order_id: string;
		order_number: string;
		to_status: OrderStatus;
	}>(sql`
		SELECT osh.id, osh.order_id, o.number AS order_number,
			osh.to_status, osh.created_at
		FROM order_status_history osh
		JOIN "order" o ON o.id = osh.order_id
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY osh.created_at DESC, osh.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: "order" as const,
			at: toDate(r.created_at),
			primary: `#${r.order_number} → ${ORDER_STATUS_LABELS[r.to_status]}`,
			href: `/dashboard/orders/${r.order_id}`,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}
