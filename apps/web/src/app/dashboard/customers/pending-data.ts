import "server-only";

import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import type { RecentClientActivityKind } from "./data";

export type CustomerPendingKind =
	| "blocked"
	| "inactive_open_order"
	| "no_doc"
	| "unverified_new";

const CUSTOMER_PENDING_PREDICATE: Record<
	CustomerPendingKind,
	ReturnType<typeof sql>
> = {
	blocked: sql`c.status = 'blocked'`,
	no_doc: sql`c.document IS NULL`,
	inactive_open_order: sql`c.status = 'inactive' AND EXISTS (SELECT 1 FROM "order" o WHERE o.client_id = c.id AND o.status IN ('pending_payment', 'preparing', 'shipped'))`,
	unverified_new: sql`c.email_verified = false AND c.created_at > now() - INTERVAL '14 days'`,
};

const CUSTOMER_PENDING_BADGE: Record<
	CustomerPendingKind,
	NonNullable<PendingRow["badge"]>
> = {
	blocked: { label: "Bloqueado", role: "warning" },
	no_doc: { label: "Sem documento", role: "warning" },
	inactive_open_order: { label: "Pedido aberto", role: "info" },
	unverified_new: { label: "Sem verificação", role: "info" },
};

export const CUSTOMER_ACTIVITY_LABELS: Record<
	RecentClientActivityKind,
	string
> = {
	new_client: "Novo cadastro",
	login: "Login",
	first_order: "1ª compra",
};

export async function fetchPendingCustomersPage({
	kind,
	cursor,
}: {
	cursor: string | null;
	kind: CustomerPendingKind;
}): Promise<InfiniteResult<PendingRow>> {
	const conditions = [CUSTOMER_PENDING_PREDICATE[kind]];
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(c.created_at, c.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		created_at: Date;
		document: string | null;
		email: string;
		id: string;
		name: string;
	}>(sql`
		SELECT c.id, c.name, c.email, c.document, c.created_at
		FROM client c
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/customers/${r.id}`,
			primary: r.name,
			secondary: r.email,
			badge: CUSTOMER_PENDING_BADGE[kind],
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchCustomerActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const cursorCreatedAt = decoded?.createdAt ?? null;

	const newClientsFilter = cursorCreatedAt
		? sql`AND c.created_at < ${cursorCreatedAt}::timestamptz`
		: sql``;
	const recentLoginsFilter = cursorCreatedAt
		? sql`HAVING MAX(created_at) < ${cursorCreatedAt}::timestamptz`
		: sql``;
	const firstOrdersFilter = cursorCreatedAt
		? sql`AND o.created_at < ${cursorCreatedAt}::timestamptz`
		: sql``;

	const result = await db.execute<{
		at: string;
		client_id: string;
		client_name: string;
		id: string;
		kind: RecentClientActivityKind;
	}>(sql`
		WITH new_clients AS (
			SELECT
				'new_client-' || c.id AS id,
				'new_client'::text AS kind,
				c.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM client c
			WHERE true ${newClientsFilter}
			ORDER BY c.created_at DESC
			LIMIT ${BATCH_SIZE + 1}
		),
		recent_logins AS (
			SELECT
				'login-' || cs.id AS id,
				'login'::text AS kind,
				max_session.last_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM (
				SELECT user_id, MAX(created_at) AS last_at
				FROM client_session
				GROUP BY user_id
				${recentLoginsFilter}
				ORDER BY last_at DESC
				LIMIT ${BATCH_SIZE + 1}
			) max_session
			JOIN client c ON c.id = max_session.user_id
			JOIN client_session cs ON cs.user_id = c.id AND cs.created_at = max_session.last_at
		),
		first_orders AS (
			SELECT
				'first_order-' || o.id AS id,
				'first_order'::text AS kind,
				o.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			WHERE o.created_at = (
				SELECT MIN(o2.created_at) FROM "order" o2 WHERE o2.client_id = o.client_id
			)
			AND o.created_at > now() - INTERVAL '7 days'
			${firstOrdersFilter}
			ORDER BY o.created_at DESC
			LIMIT ${BATCH_SIZE + 1}
		)
		SELECT * FROM new_clients
		UNION ALL SELECT * FROM recent_logins
		UNION ALL SELECT * FROM first_orders
		ORDER BY at DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: "customer" as const,
			at: toDate(r.at),
			primary: `${CUSTOMER_ACTIVITY_LABELS[r.kind]} · ${r.client_name}`,
			href: `/dashboard/customers/${r.client_id}`,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.at).toISOString(),
			id: last.id,
		})
	);
}
