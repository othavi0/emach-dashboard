import { db } from "@emach/db";
import {
	type OrderStatus,
	orderStatusHistory,
	order as orderTable,
} from "@emach/db/schema/orders";
import { toDate } from "@emach/db/utils";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import { formatAgingLabel, getAgingLevel } from "./_lib/aging";
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
		entered_at: Date | null;
		id: string;
		number: string;
		status: OrderStatus;
	}>(sql`
		SELECT
			o.id,
			o.number,
			o.status,
			o.created_at,
			c.name AS client_name,
			CASE o.status
				WHEN 'paid' THEN o.paid_at
				WHEN 'preparing' THEN o.preparing_at
				WHEN 'shipped' THEN o.shipped_at
				ELSE o.created_at
			END AS entered_at
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): PendingRow => {
			const enteredAt = r.entered_at ? toDate(r.entered_at) : null;
			const level = getAgingLevel(r.status, enteredAt);
			return {
				id: r.id,
				href: `/dashboard/orders/${r.id}`,
				primary: `#${r.number} · ${r.client_name}`,
				badge: PENDING_ORDER_BADGE[r.status] ?? {
					label: r.status,
					role: "info",
				},
				aging: enteredAt
					? { level, label: formatAgingLabel(enteredAt) }
					: undefined,
			};
		},
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

	const cursorCondition = cursor
		? (() => {
				const c = decodeCursorAs(cursor, "newest");
				return sql`(${orderStatusHistory.createdAt}, ${orderStatusHistory.id}) < (${c.createdAt}::timestamp, ${c.id})`;
			})()
		: undefined;

	const rows = await db
		.select({
			id: orderStatusHistory.id,
			orderId: orderStatusHistory.orderId,
			orderNumber: orderTable.number,
			toStatus: orderStatusHistory.toStatus,
			createdAt: orderStatusHistory.createdAt,
		})
		.from(orderStatusHistory)
		.innerJoin(orderTable, eq(orderStatusHistory.orderId, orderTable.id))
		.where(cursorCondition ? and(cursorCondition) : undefined)
		.orderBy(desc(orderStatusHistory.createdAt), desc(orderStatusHistory.id))
		.limit(BATCH_SIZE + 1);

	return paginate(
		rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: "order" as const,
			at: r.createdAt,
			primary: `#${r.orderNumber} → ${ORDER_STATUS_LABELS[r.toStatus]}`,
			href: `/dashboard/orders/${r.orderId}`,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: last.createdAt.toISOString(),
			id: last.id,
		})
	);
}
