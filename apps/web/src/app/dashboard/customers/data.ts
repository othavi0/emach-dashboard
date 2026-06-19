import "server-only";

import { db } from "@emach/db";
import {
	REVENUE_ORDER_STATUSES,
	sqlStatusList,
} from "@emach/db/queries/order-status-groups";
import { user } from "@emach/db/schema/auth";
import {
	type ClientStatus,
	type ClientType,
	client,
	clientAddress,
	clientSession,
} from "@emach/db/schema/client";
import {
	type ClientAuditAction,
	clientAuditLog,
} from "@emach/db/schema/client-audit";
import { type ConsentKind, consentLog } from "@emach/db/schema/consent-log";
import type { OrderStatus } from "@emach/db/schema/orders";
import { review } from "@emach/db/schema/reviews";
import { tool } from "@emach/db/schema/tools";
import { toDate } from "@emach/db/utils";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";

import type { CustomersListFilters } from "./schema";

export interface CustomerListItem {
	clientType: ClientType | null;
	createdAt: Date;
	document: string | null;
	email: string;
	emailVerified: boolean;
	id: string;
	image: string | null;
	lastOrderAt: Date | null;
	lastOrderStatus: OrderStatus | null;
	ltv: number;
	name: string;
	ordersCount: number;
	status: ClientStatus;
}

export interface CustomerDetail {
	clientType: ClientType | null;
	createdAt: Date;
	document: string | null;
	email: string;
	emailVerified: boolean;
	id: string;
	image: string | null;
	internalNotes: string | null;
	lastSeenAt: Date | null;
	name: string;
	phone: string | null;
	status: ClientStatus;
	updatedAt: Date;
}

export interface CustomerKpis {
	averageTicket: number;
	daysSinceCreated: number;
	lastOrderAt: Date | null;
	lastOrderStatus: OrderStatus | null;
	ltv: number;
	ordersCount: number;
}

export interface CustomerOrderRow {
	createdAt: Date;
	id: string;
	itemsCount: number;
	number: string;
	status: OrderStatus;
	totalAmount: number;
}

export interface CustomerOrdersResult {
	items: CustomerOrderRow[];
	page: number;
	total: number;
	totalPages: number;
}

export interface CustomerReviewRow {
	body: string;
	createdAt: Date;
	id: string;
	moderationNote: string | null;
	orderId: string | null;
	rating: number;
	status: string;
	title: string | null;
	toolId: string;
	toolName: string;
}

export interface CustomerConsentRow {
	granted: boolean;
	grantedAt: Date;
	id: string;
	kind: ConsentKind;
	revokedAt: Date | null;
	version: string;
}

export type CustomerConsentByKind = Partial<
	Record<ConsentKind, CustomerConsentRow[]>
>;

export interface CustomerSessionRow {
	createdAt: Date;
	expiresAt: Date;
	id: string;
	ipAddress: string | null;
	updatedAt: Date;
	userAgent: string | null;
}

export interface CustomerAuditRow {
	action: ClientAuditAction;
	actorLabel: string;
	afterJson: unknown;
	beforeJson: unknown;
	createdAt: Date;
	id: string;
	reason: string | null;
}

export interface CustomerAddressRow {
	city: string;
	complement: string | null;
	country: string;
	createdAt: Date;
	id: string;
	isDefault: boolean;
	label: string | null;
	neighborhood: string;
	number: string;
	recipient: string;
	state: string;
	street: string;
	updatedAt: Date;
	zipCode: string;
}

const ESCAPED_LIKE = (raw: string) =>
	`%${raw.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

function formatActorLabel(entry: {
	actorType: "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	return entry.actorUserName ?? "Usuário";
}

// ============================================================================
// LISTAGEM (infinite scroll cursor-based, 4 variantes de sort)
// ============================================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filter assembly + 4-variant cursor encoding intentionally co-located
export async function listCustomers({
	filters,
	cursor,
}: {
	cursor: string | null;
	filters: CustomersListFilters;
}): Promise<InfiniteResult<CustomerListItem>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions: ReturnType<typeof sql>[] = [];

	const query = filters.q?.trim();
	if (query) {
		const like = ESCAPED_LIKE(query);
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
	if (filters.lastOrderFrom) {
		conditions.push(sql`stats.last_order_at >= ${filters.lastOrderFrom}::date`);
	}
	if (filters.lastOrderTo) {
		conditions.push(
			sql`stats.last_order_at < (${filters.lastOrderTo}::date + INTERVAL '1 day')`
		);
	}
	if (filters.ltvMin !== undefined) {
		conditions.push(sql`COALESCE(stats.ltv, 0) >= ${filters.ltvMin}`);
	}
	if (filters.ltvMax !== undefined) {
		conditions.push(sql`COALESCE(stats.ltv, 0) <= ${filters.ltvMax}`);
	}
	if (filters.missingDoc) {
		conditions.push(sql`c.document IS NULL`);
	}
	if (filters.openOrderInactive) {
		conditions.push(
			sql`c.status = 'inactive' AND EXISTS (SELECT 1 FROM "order" o WHERE o.client_id = c.id AND o.status IN ('pending_payment', 'preparing', 'shipped'))`
		);
	}
	if (filters.unverifiedNew) {
		conditions.push(
			sql`c.email_verified = false AND c.created_at > now() - INTERVAL '14 days'`
		);
	}

	// Cursor where (sort-aware)
	const sort = filters.sort;
	let orderBy: ReturnType<typeof sql>;
	if (sort === "createdDesc") {
		orderBy = sql`c.created_at DESC, c.id DESC`;
		if (decoded?.sort === "newest") {
			conditions.push(
				sql`(c.created_at, c.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			);
		}
	} else if (sort === "ltvDesc") {
		orderBy = sql`COALESCE(stats.ltv, 0) DESC, c.id DESC`;
		if (decoded?.sort === "ltvDesc") {
			conditions.push(
				sql`(COALESCE(stats.ltv, 0), c.id) < (${decoded.ltv}::numeric, ${decoded.id})`
			);
		}
	} else if (sort === "lastOrderDesc") {
		orderBy = sql`stats.last_order_at DESC NULLS LAST, c.id DESC`;
		if (decoded?.sort === "lastOrderDesc") {
			if (decoded.lastOrderAt) {
				conditions.push(
					sql`(stats.last_order_at IS NULL OR stats.last_order_at < ${decoded.lastOrderAt}::timestamptz OR (stats.last_order_at = ${decoded.lastOrderAt}::timestamptz AND c.id < ${decoded.id}))`
				);
			} else {
				conditions.push(
					sql`stats.last_order_at IS NULL AND c.id < ${decoded.id}`
				);
			}
		}
	} else {
		orderBy = sql`c.name ASC, c.id ASC`;
		if (decoded?.sort === "nameAsc") {
			conditions.push(sql`(c.name, c.id) > (${decoded.name}, ${decoded.id})`);
		}
	}

	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const rows = await db.execute<{
		client_type: ClientType | null;
		created_at: Date;
		document: string | null;
		email: string;
		email_verified: boolean;
		id: string;
		image: string | null;
		last_order_at: Date | null;
		last_order_status: OrderStatus | null;
		ltv: string | null;
		name: string;
		orders_count: number | null;
		status: ClientStatus;
	}>(sql`
		WITH order_stats AS (
			SELECT
				o.client_id,
				SUM(CASE WHEN o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)}) THEN o.total_amount ELSE 0 END)::numeric AS ltv,
				COUNT(*)::int AS orders_count,
				MAX(o.created_at) AS last_order_at,
				(SELECT status FROM "order" lo WHERE lo.client_id = o.client_id ORDER BY lo.created_at DESC LIMIT 1) AS last_order_status
			FROM "order" o
			GROUP BY o.client_id
		)
		SELECT
			c.id, c.name, c.email, c.email_verified, c.image, c.document,
			c.status, c.client_type, c.created_at,
			stats.ltv, stats.orders_count, stats.last_order_at, stats.last_order_status
		FROM client c
		LEFT JOIN order_stats stats ON stats.client_id = c.id
		${whereClause}
		ORDER BY ${orderBy}
		LIMIT ${BATCH_SIZE + 1}
	`);

	return paginate(
		rows.rows,
		(r) => ({
			id: r.id,
			name: r.name,
			email: r.email,
			emailVerified: r.email_verified,
			image: r.image,
			document: r.document,
			status: r.status,
			clientType: r.client_type,
			ltv: Number(r.ltv ?? 0),
			ordersCount: Number(r.orders_count ?? 0),
			lastOrderAt: toDate(r.last_order_at),
			lastOrderStatus: r.last_order_status,
			createdAt: toDate(r.created_at),
		}),
		(last) => {
			if (sort === "createdDesc") {
				return {
					v: 1,
					sort: "newest" as const,
					createdAt: toDate(last.created_at).toISOString(),
					id: last.id,
				};
			}
			if (sort === "ltvDesc") {
				return {
					v: 1,
					sort: "ltvDesc" as const,
					ltv: Number(last.ltv ?? 0),
					id: last.id,
				};
			}
			if (sort === "lastOrderDesc") {
				const at = last.last_order_at
					? toDate(last.last_order_at).toISOString()
					: null;
				return {
					v: 1,
					sort: "lastOrderDesc" as const,
					lastOrderAt: at,
					id: last.id,
				};
			}
			return { v: 1, sort: "nameAsc" as const, name: last.name, id: last.id };
		}
	);
}

// ============================================================================
// DETAIL
// ============================================================================

export async function getCustomerDetail(
	id: string
): Promise<CustomerDetail | null> {
	const [row] = await db.select().from(client).where(eq(client.id, id));
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: row.emailVerified,
		image: row.image,
		phone: row.phone,
		document: row.document,
		status: row.status,
		clientType: row.clientType,
		internalNotes: row.internalNotes,
		lastSeenAt: row.lastSeenAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

// ============================================================================
// KPIS
// ============================================================================

export async function getCustomerKpis(id: string): Promise<CustomerKpis> {
	const result = await db.execute<{
		avg_ticket: string | null;
		days_since_created: number | null;
		last_order_at: Date | null;
		last_order_status: OrderStatus | null;
		ltv: string | null;
		orders_count: number | null;
	}>(sql`
		SELECT
			COALESCE(SUM(CASE WHEN o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)}) THEN o.total_amount ELSE 0 END), 0)::numeric AS ltv,
			COUNT(o.id)::int AS orders_count,
			COALESCE(AVG(CASE WHEN o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)}) THEN o.total_amount END), 0)::numeric AS avg_ticket,
			MAX(o.created_at) AS last_order_at,
			(SELECT status FROM "order" WHERE client_id = ${id} ORDER BY created_at DESC LIMIT 1) AS last_order_status,
			EXTRACT(day FROM (now() - c.created_at))::int AS days_since_created
		FROM client c
		LEFT JOIN "order" o ON o.client_id = c.id
		WHERE c.id = ${id}
		GROUP BY c.created_at
	`);
	const r = result.rows[0];
	return {
		ltv: Number(r?.ltv ?? 0),
		ordersCount: Number(r?.orders_count ?? 0),
		averageTicket: Number(r?.avg_ticket ?? 0),
		lastOrderAt: toDate(r?.last_order_at ?? null),
		lastOrderStatus: r?.last_order_status ?? null,
		daysSinceCreated: Number(r?.days_since_created ?? 0),
	};
}

export const CUSTOMER_ORDERS_PAGE_SIZE = 20;

export async function getCustomerOrders(
	id: string,
	page = 1
): Promise<CustomerOrdersResult> {
	const pageNum = Math.max(1, page);
	const offset = (pageNum - 1) * CUSTOMER_ORDERS_PAGE_SIZE;

	const rows = await db.execute<{
		created_at: Date;
		id: string;
		items_count: number;
		number: string;
		status: OrderStatus;
		total_amount: string;
		total_count: number;
	}>(sql`
		SELECT
			o.id, o.number, o.status, o.total_amount, o.created_at,
			(SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS items_count,
			COUNT(*) OVER()::int AS total_count
		FROM "order" o
		WHERE o.client_id = ${id}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${CUSTOMER_ORDERS_PAGE_SIZE}
		OFFSET ${offset}
	`);

	const total = rows.rows[0]?.total_count ?? 0;
	const totalPages =
		total === 0 ? 1 : Math.ceil(total / CUSTOMER_ORDERS_PAGE_SIZE);

	return {
		items: rows.rows.map((r) => ({
			id: r.id,
			number: r.number,
			status: r.status,
			totalAmount: Number(r.total_amount),
			createdAt: toDate(r.created_at),
			itemsCount: Number(r.items_count),
		})),
		page: pageNum,
		total,
		totalPages,
	};
}

export async function getCustomerReviews(
	id: string
): Promise<CustomerReviewRow[]> {
	const rows = await db
		.select({
			id: review.id,
			toolId: review.toolId,
			toolName: tool.name,
			orderId: review.orderId,
			rating: review.rating,
			title: review.title,
			body: review.body,
			status: review.status,
			moderationNote: review.moderationNote,
			createdAt: review.createdAt,
		})
		.from(review)
		.innerJoin(tool, eq(tool.id, review.toolId))
		.where(eq(review.clientId, id))
		.orderBy(desc(review.createdAt));

	return rows.map((r) => ({
		id: r.id,
		toolId: r.toolId,
		toolName: r.toolName,
		orderId: r.orderId,
		rating: r.rating,
		title: r.title,
		body: r.body,
		status: r.status,
		moderationNote: r.moderationNote,
		createdAt: r.createdAt,
	}));
}

export async function getCustomerConsent(
	id: string
): Promise<CustomerConsentByKind> {
	const rows = await db
		.select({
			id: consentLog.id,
			kind: consentLog.kind,
			granted: consentLog.granted,
			version: consentLog.version,
			grantedAt: consentLog.grantedAt,
			revokedAt: consentLog.revokedAt,
		})
		.from(consentLog)
		.where(eq(consentLog.clientId, id))
		.orderBy(asc(consentLog.kind), desc(consentLog.grantedAt));

	const grouped: CustomerConsentByKind = {};
	for (const r of rows) {
		const arr = grouped[r.kind] ?? [];
		arr.push({
			id: r.id,
			kind: r.kind,
			granted: r.granted,
			version: r.version,
			grantedAt: r.grantedAt,
			revokedAt: r.revokedAt,
		});
		grouped[r.kind] = arr;
	}
	return grouped;
}

export async function getCustomerSessions(
	id: string
): Promise<CustomerSessionRow[]> {
	const rows = await db
		.select({
			id: clientSession.id,
			expiresAt: clientSession.expiresAt,
			createdAt: clientSession.createdAt,
			updatedAt: clientSession.updatedAt,
			ipAddress: clientSession.ipAddress,
			userAgent: clientSession.userAgent,
		})
		.from(clientSession)
		.where(eq(clientSession.userId, id))
		.orderBy(desc(clientSession.createdAt));

	return rows.map((r) => ({
		id: r.id,
		expiresAt: r.expiresAt,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
		ipAddress: r.ipAddress,
		userAgent: r.userAgent,
	}));
}

export async function getCustomerAudit(
	id: string,
	options: { action?: ClientAuditAction } = {}
): Promise<CustomerAuditRow[]> {
	const conditions = [eq(clientAuditLog.clientId, id)];
	if (options.action) {
		conditions.push(eq(clientAuditLog.action, options.action));
	}

	const rows = await db
		.select({
			id: clientAuditLog.id,
			action: clientAuditLog.action,
			actorType: clientAuditLog.actorType,
			actorUserName: user.name,
			beforeJson: clientAuditLog.beforeJson,
			afterJson: clientAuditLog.afterJson,
			reason: clientAuditLog.reason,
			createdAt: clientAuditLog.createdAt,
		})
		.from(clientAuditLog)
		.leftJoin(user, eq(user.id, clientAuditLog.actorUserId))
		.where(and(...conditions))
		.orderBy(desc(clientAuditLog.createdAt));

	return rows.map((r) => ({
		id: r.id,
		action: r.action,
		actorLabel: formatActorLabel({
			actorType: r.actorType,
			actorUserName: r.actorUserName,
		}),
		beforeJson: r.beforeJson,
		afterJson: r.afterJson,
		reason: r.reason,
		createdAt: r.createdAt,
	}));
}

export async function getCustomerAddresses(
	id: string
): Promise<CustomerAddressRow[]> {
	const rows = await db
		.select()
		.from(clientAddress)
		.where(eq(clientAddress.clientId, id))
		.orderBy(desc(clientAddress.isDefault), asc(clientAddress.label));

	return rows.map((r) => ({
		id: r.id,
		label: r.label,
		recipient: r.recipient,
		zipCode: r.zipCode,
		street: r.street,
		number: r.number,
		complement: r.complement,
		neighborhood: r.neighborhood,
		city: r.city,
		state: r.state,
		country: r.country,
		isDefault: r.isDefault,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	}));
}

export type { CustomersListFilters } from "./schema";

export interface CustomerPendingCounts {
	blocked: number;
	inactiveWithOpenOrder: number;
	noDoc: number;
	unverifiedNew: number;
}

export async function getCustomerPendingCounts(): Promise<CustomerPendingCounts> {
	const result = await db.execute<{
		blocked: string;
		no_doc: string;
		inactive_with_open_order: string;
		unverified_new: string;
	}>(sql`
		SELECT
			COUNT(*) FILTER (WHERE c.status = 'blocked') AS blocked,
			COUNT(*) FILTER (WHERE c.document IS NULL) AS no_doc,
			COUNT(*) FILTER (
				WHERE c.status = 'inactive'
				AND EXISTS (
					SELECT 1 FROM "order" o
					WHERE o.client_id = c.id
					AND o.status IN ('pending_payment', 'preparing', 'shipped')
				)
			) AS inactive_with_open_order,
			COUNT(*) FILTER (
				WHERE c.email_verified = false
				AND c.created_at > now() - INTERVAL '14 days'
			) AS unverified_new
		FROM client c
	`);

	const row = result.rows[0];
	return {
		blocked: Number(row?.blocked ?? 0),
		noDoc: Number(row?.no_doc ?? 0),
		inactiveWithOpenOrder: Number(row?.inactive_with_open_order ?? 0),
		unverifiedNew: Number(row?.unverified_new ?? 0),
	};
}

export type RecentClientActivityKind = "new_client" | "login" | "first_order";

export interface RecentClientActivity {
	at: Date;
	clientId: string;
	clientName: string;
	id: string;
	kind: RecentClientActivityKind;
}

export async function getRecentCustomerActivity(
	limit = 8
): Promise<RecentClientActivity[]> {
	const result = await db.execute<{
		id: string;
		kind: RecentClientActivityKind;
		at: string;
		client_id: string;
		client_name: string;
	}>(sql`
		WITH new_clients AS (
			SELECT
				c.id AS id,
				'new_client'::text AS kind,
				c.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM client c
			ORDER BY c.created_at DESC
			LIMIT ${limit}
		),
		recent_logins AS (
			SELECT
				cs.id AS id,
				'login'::text AS kind,
				max_session.last_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM (
				SELECT user_id, MAX(created_at) AS last_at
				FROM client_session
				GROUP BY user_id
				ORDER BY last_at DESC
				LIMIT ${limit}
			) max_session
			JOIN client c ON c.id = max_session.user_id
			JOIN client_session cs ON cs.user_id = c.id AND cs.created_at = max_session.last_at
		),
		first_orders AS (
			SELECT
				o.id AS id,
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
			ORDER BY o.created_at DESC
			LIMIT ${limit}
		)
		SELECT * FROM new_clients
		UNION ALL SELECT * FROM recent_logins
		UNION ALL SELECT * FROM first_orders
		ORDER BY at DESC
		LIMIT ${limit}
	`);

	return result.rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		at: new Date(r.at),
		clientId: r.client_id,
		clientName: r.client_name,
	}));
}
