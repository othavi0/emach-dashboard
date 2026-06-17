import { cache } from "react";
import { db } from "@emach/db";
import {
	REVENUE_ORDER_STATUSES,
	sqlStatusList,
} from "@emach/db/queries/order-status-groups";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";
import { toDate } from "@emach/db/utils";

export type { OrderStatus } from "@emach/db/schema/orders";

import {
	type OrderStatus,
	orderAttachment,
	orderEvent,
	orderItem,
	orderNote,
	orderStatusHistory,
	refundRequest,
} from "@emach/db/schema/orders";
import { asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import {
	getUserBranchScope,
	isBlindScope,
	orderBranchCondition,
	orderBranchConditionNoAlias,
	orderInScope,
} from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import { createSignedUrl, ORDER_DOCUMENTS_BUCKET } from "@/lib/storage";
import { ALL_ORDERS_TAB, ORDER_TABS } from "./status-meta";

export const ORDERS_PAGE_SIZE = 20;

export interface OrderListFilters {
	branchId?: string;
	from?: string;
	page?: number;
	q?: string;
	tab?: string;
	to?: string;
	unverifiedShipping?: boolean;
}

export interface OrderListItem {
	branchName: string | null;
	clientName: string;
	createdAt: Date;
	id: string;
	itemsCount: number;
	number: string;
	shippingUnverified: boolean;
	status: OrderStatus;
	totalAmount: number;
}

export interface OrderListResult {
	items: OrderListItem[];
	page: number;
	total: number;
	totalPages: number;
}

export interface BranchOption {
	cepRanges: Array<{ from: string; to: string }> | null;
	id: string;
	name: string;
}

export interface OrderDetailItem {
	cest: string | null;
	discountAmount: number;
	heightCm: number | null;
	id: string;
	lengthCm: number | null;
	lineTotal: number;
	manufacturerName: string | null;
	model: string | null;
	name: string;
	ncm: string | null;
	orderId: string;
	quantity: number;
	sku: string | null;
	toolId: string;
	unitPrice: number;
	voltage: string | null;
	weightKg: number | null;
	widthCm: number | null;
}

export interface OrderHistoryItem {
	actorLabel: string;
	createdAt: Date;
	fromStatus: OrderStatus;
	id: string;
	reason: string | null;
	toStatus: OrderStatus;
}

export interface OrderNoteItem {
	authorName: string;
	body: string;
	createdAt: Date;
	id: string;
	pinned: boolean;
	statusAtCreation: OrderStatus | null;
}

export interface OrderRefundItem {
	amount: number;
	asaasRefundRef: string | null;
	id: string;
	reasonCategory: string;
	reasonText: string | null;
	rejectionReason: string | null;
	requestedAt: Date;
	resolvedAt: Date | null;
	status: string;
}

export interface OrderEventItem {
	actorLabel: string;
	createdAt: Date;
	eventType: string;
	id: string;
	metadata: Record<string, unknown> | null;
}

export interface OrderAttachmentItem {
	createdAt: Date;
	description: string | null;
	fileName: string;
	fileSize: number | null;
	id: string;
	label: string | null;
	mimeType: string | null;
	uploaderName: string;
	/** Signed URL (1-hour TTL). Null if signing failed — treat as temporarily unavailable. */
	url: string | null;
}

export interface ShippingAddressSnapshot {
	city?: string;
	complement?: string;
	country?: string;
	neighborhood?: string;
	number?: string;
	recipient?: string;
	state?: string;
	street?: string;
	zipCode?: string;
}

export interface OrderDetail {
	attachments: OrderAttachmentItem[];
	branchId: string | null;
	branchName: string | null;
	canceledAt: Date | null;
	clientDocument: string | null;
	clientEmail: string;
	clientId: string;
	clientImage: string | null;
	clientName: string;
	clientPhone: string | null;
	clientType: string | null;
	createdAt: Date;
	/** Observação preenchida pelo CLIENTE no checkout (ex.: "deixar com porteiro"). */
	customerNotes: string | null;
	deliveredAt: Date | null;
	discountAmount: number;
	events: OrderEventItem[];
	history: OrderHistoryItem[];
	id: string;
	items: OrderDetailItem[];
	/** NF-e number emitted by the e-commerce app. Read-only in admin. */
	nfeNumber: string | null;
	/** NF-e status (e.g. "authorized", "canceled"). Read-only in admin. */
	nfeStatus: string | null;
	/** NF-e PDF/DANFE URL. Read-only in admin. */
	nfeUrl: string | null;
	/** NF-e XML URL. Read-only in admin. */
	nfeXmlUrl: string | null;
	notes: OrderNoteItem[];
	number: string;
	paidAt: Date | null;
	paymentMethod: string | null;
	paymentProviderRef: string | null;
	/** Asaas payment receipt URL. Read-only in admin. */
	paymentReceiptUrl: string | null;
	preparingAt: Date | null;
	refundRequests: OrderRefundItem[];
	shippedAt: Date | null;
	shippingAddress: ShippingAddressSnapshot;
	shippingAmount: number;
	shippingMethod: string | null;
	shippingTrackingCode: string | null;
	/** true = frete não revalidado no checkout (fail-open ecommerce); staff revisa. */
	shippingUnverified: boolean;
	status: OrderStatus;
	subtotalAmount: number;
	totalAmount: number;
}

function parseNumber(value: string | number | null): number | null {
	if (value === null) {
		return null;
	}
	return typeof value === "number" ? value : Number(value);
}

function normalizeDateParam(value?: string): string | undefined {
	if (!value) {
		return;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function resolveTab(tab?: string) {
	return ORDER_TABS.find((item) => item.key === tab) ?? ALL_ORDERS_TAB;
}

function formatActorLabel(entry: {
	actorType: "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	return entry.actorUserName ?? "Usuário";
}

export function getOrderTab(
	tab?: string
): (typeof ORDER_TABS)[number] | typeof ALL_ORDERS_TAB {
	return resolveTab(tab);
}

export function getOrderTabCountsKey(status: OrderStatus): string {
	return status;
}

export const listOrderBranches = cache(
	async (): Promise<BranchOption[]> => {
		const session = await requireCurrentSession();
		const scope = await getUserBranchScope(session);
		const query = db
			.select({ cepRanges: branch.cepRanges, id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name));
		if (scope.kind === "all") {
			return query;
		}
		if (scope.branchIds.length === 0) {
			return [];
		}
		return db
			.select({ cepRanges: branch.cepRanges, id: branch.id, name: branch.name })
			.from(branch)
			.where(inArray(branch.id, scope.branchIds))
			.orderBy(asc(branch.name));
	},
);

export interface OrdersPageFiltersInput {
	branchId?: string;
	from?: string;
	q?: string;
	tab?: string;
	to?: string;
	unverifiedShipping?: boolean;
}

export async function fetchOrdersPage({
	filters,
	cursor,
}: {
	filters: OrdersPageFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);

	if (isBlindScope(scope)) {
		return { items: [], nextCursor: null };
	}

	const tab = resolveTab(filters.tab);
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions = [] as ReturnType<typeof sql>[];
	const query = filters.q?.trim();
	const from = normalizeDateParam(filters.from);
	const to = normalizeDateParam(filters.to);

	const branchCondition = orderBranchCondition(scope);
	if (branchCondition) {
		conditions.push(branchCondition);
	}
	if (tab.statuses) {
		const placeholders = sql.join(
			tab.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (query) {
		conditions.push(
			sql`(o.number ILIKE ${`%${query}%`} OR c.name ILIKE ${`%${query}%`})`
		);
	}
	if (filters.branchId) {
		conditions.push(sql`o.branch_id = ${filters.branchId}`);
	}
	if (filters.unverifiedShipping) {
		conditions.push(sql`o.shipping_unverified = true`);
	}
	if (from) {
		conditions.push(sql`o.created_at >= ${from}::date`);
	}
	if (to) {
		conditions.push(sql`o.created_at < (${to}::date + INTERVAL '1 day')`);
	}
	if (decoded && decoded.sort === "newest") {
		conditions.push(
			sql`(o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		);
	}

	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const rows = await db.execute<{
		branch_name: string | null;
		client_name: string;
		created_at: Date;
		id: string;
		items_count: number;
		number: string;
		shipping_unverified: boolean;
		status: OrderStatus;
		total_amount: string;
	}>(sql`
		SELECT
			o.id,
			o.number,
			o.status,
			o.total_amount,
			o.created_at,
			o.shipping_unverified,
			c.name AS client_name,
			b.name AS branch_name,
			(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN branch b ON b.id = o.branch_id
		${whereClause}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);

	const mapped = rows.rows.map((row) => ({
		id: row.id,
		number: row.number,
		status: row.status,
		totalAmount: Number(row.total_amount),
		itemsCount: row.items_count,
		createdAt: toDate(row.created_at),
		clientName: row.client_name,
		branchName: row.branch_name,
		shippingUnverified: row.shipping_unverified,
	}));

	const hasMore = mapped.length > BATCH_SIZE;
	const items = hasMore ? mapped.slice(0, BATCH_SIZE) : mapped;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;
	return { items, nextCursor };
}

export async function listOrders(
	filters: OrderListFilters
): Promise<OrderListResult> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);

	if (isBlindScope(scope)) {
		return { items: [], page: 1, total: 0, totalPages: 1 };
	}

	const tab = resolveTab(filters.tab);
	const page = Math.max(1, filters.page ?? 1);
	const offset = (page - 1) * ORDERS_PAGE_SIZE;
	const conditions = [] as ReturnType<typeof sql>[];
	const query = filters.q?.trim();
	const from = normalizeDateParam(filters.from);
	const to = normalizeDateParam(filters.to);

	const branchCondition = orderBranchCondition(scope);
	if (branchCondition) {
		conditions.push(branchCondition);
	}
	if (tab.statuses) {
		const placeholders = sql.join(
			tab.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (query) {
		conditions.push(
			sql`(o.number ILIKE ${`%${query}%`} OR c.name ILIKE ${`%${query}%`})`
		);
	}
	if (filters.branchId) {
		conditions.push(sql`o.branch_id = ${filters.branchId}`);
	}
	if (filters.unverifiedShipping) {
		conditions.push(sql`o.shipping_unverified = true`);
	}
	if (from) {
		conditions.push(sql`o.created_at >= ${from}::date`);
	}
	if (to) {
		conditions.push(sql`o.created_at < (${to}::date + INTERVAL '1 day')`);
	}

	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const rows = await db.execute<{
		branch_name: string | null;
		client_name: string;
		created_at: Date;
		id: string;
		items_count: number;
		number: string;
		shipping_unverified: boolean;
		status: OrderStatus;
		total_amount: string;
		total_count: number;
	}>(sql`
		SELECT
			o.id,
			o.number,
			o.status,
			o.total_amount,
			o.created_at,
			o.shipping_unverified,
			c.name AS client_name,
			b.name AS branch_name,
			(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count,
			COUNT(*) OVER()::int AS total_count
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN branch b ON b.id = o.branch_id
		${whereClause}
		ORDER BY o.created_at DESC, o.number DESC
		LIMIT ${ORDERS_PAGE_SIZE}
		OFFSET ${offset}
	`);

	const total = rows.rows[0]?.total_count ?? 0;
	const totalPages = total === 0 ? 1 : Math.ceil(total / ORDERS_PAGE_SIZE);

	return {
		items: rows.rows.map((row) => ({
			id: row.id,
			number: row.number,
			status: row.status,
			totalAmount: Number(row.total_amount),
			itemsCount: row.items_count,
			createdAt: toDate(row.created_at),
			clientName: row.client_name,
			branchName: row.branch_name,
			shippingUnverified: row.shipping_unverified,
		})),
		page,
		total,
		totalPages,
	};
}

export interface OrderActivityRow {
	createdAt: Date;
	id: string;
	orderId: string;
	orderNumber: string;
	toStatus: OrderStatus;
}

export async function getRecentOrderActivity(
	limit = 15
): Promise<OrderActivityRow[]> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const result = await db.execute<{
		created_at: Date;
		id: string;
		order_id: string;
		order_number: string;
		to_status: OrderStatus;
	}>(sql`
		SELECT
			osh.id,
			osh.order_id,
			o.number AS order_number,
			osh.to_status,
			osh.created_at
		FROM order_status_history osh
		JOIN "order" o ON o.id = osh.order_id
		${branchCond ? sql`WHERE ${branchCond}` : sql``}
		ORDER BY osh.created_at DESC
		LIMIT ${limit}
	`);
	return result.rows.map((r) => ({
		id: r.id,
		orderId: r.order_id,
		orderNumber: r.order_number,
		toStatus: r.to_status,
		createdAt: toDate(r.created_at),
	}));
}

export async function getOrdersTabCounts(): Promise<Record<string, number>> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (isBlindScope(scope)) {
		return {
			all_count: 0,
			pending_payment: 0,
			payment_failed: 0,
			paid: 0,
			preparing: 0,
			shipped: 0,
			delivered: 0,
			returned: 0,
			canceled: 0,
		};
	}

	// Subqueries usam a tabela sem alias → condição com coluna `branch_id`.
	const branchFilter = orderBranchConditionNoAlias(scope);

	const and = (base: SQL, extra: SQL | undefined): SQL =>
		extra ? sql`${base} AND ${extra}` : base;

	const result = await db.execute<Record<string, number>>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM "order" ${branchFilter ? sql`WHERE ${branchFilter}` : sql``}) AS all_count,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'pending_payment'`, branchFilter)}) AS pending_payment,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'payment_failed'`, branchFilter)}) AS payment_failed,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'paid'`, branchFilter)}) AS paid,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'preparing'`, branchFilter)}) AS preparing,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'shipped'`, branchFilter)}) AS shipped,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'delivered'`, branchFilter)}) AS delivered,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status = 'returned'`, branchFilter)}) AS returned,
			(SELECT COUNT(*)::int FROM "order" WHERE ${and(sql`status IN ('canceled', 'refunded')`, branchFilter)}) AS canceled
	`);

	return (
		result.rows[0] ?? {
			all_count: 0,
			pending_payment: 0,
			payment_failed: 0,
			paid: 0,
			preparing: 0,
			shipped: 0,
			delivered: 0,
			returned: 0,
			canceled: 0,
		}
	);
}

export type OrderReviewState =
	| "no_review_open"
	| "no_review_expired"
	| "has_review"
	| "order_not_paid";

export interface OrderReviewRow {
	daysRemaining: number | null;
	review: {
		id: string;
		rating: number;
		status: string;
	} | null;
	reviewState: OrderReviewState;
	thumbUrl: string | null;
	toolId: string;
	toolName: string;
}

export async function getOrderReviewsOverview(
	orderId: string
): Promise<OrderReviewRow[]> {
	const result = await db.execute<{
		tool_id: string;
		tool_name: string;
		thumb_url: string | null;
		review_id: string | null;
		rating: number | null;
		review_status: string | null;
		review_state: OrderReviewState;
		days_remaining: number | null;
	}>(sql`
		WITH order_meta AS (
			SELECT id, paid_at,
				(paid_at + interval '90 days') AS review_deadline
			FROM "order" WHERE id = ${orderId}
		),
		tools_in_order AS (
			SELECT DISTINCT ON (oi.tool_id)
				oi.tool_id,
				t.name AS tool_name,
				(
					SELECT ti.url FROM tool_image ti
					WHERE ti.tool_id = t.id
					ORDER BY ti.sort_order ASC
					LIMIT 1
				) AS thumb_url
			FROM order_item oi
			JOIN tool t ON t.id = oi.tool_id
			WHERE oi.order_id = ${orderId}
		)
		SELECT
			tio.tool_id,
			tio.tool_name,
			tio.thumb_url,
			r.id AS review_id,
			r.rating,
			r.status AS review_status,
			CASE
				WHEN om.paid_at IS NULL THEN 'order_not_paid'
				WHEN r.id IS NOT NULL THEN 'has_review'
				WHEN now() > om.review_deadline THEN 'no_review_expired'
				ELSE 'no_review_open'
			END AS review_state,
			CASE
				WHEN om.paid_at IS NULL THEN NULL
				ELSE GREATEST(0, EXTRACT(day FROM (om.review_deadline - now())))::int
			END AS days_remaining
		FROM tools_in_order tio
		CROSS JOIN order_meta om
		LEFT JOIN review r
			ON r.order_id = ${orderId} AND r.tool_id = tio.tool_id
		ORDER BY tio.tool_name ASC
	`);

	return result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		thumbUrl: row.thumb_url,
		review:
			row.review_id && row.rating !== null && row.review_status
				? {
						id: row.review_id,
						rating: Number(row.rating),
						status: row.review_status,
					}
				: null,
		reviewState: row.review_state,
		daysRemaining:
			row.days_remaining === null ? null : Number(row.days_remaining),
	}));
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	const [base, items, history, notes, attachmentRows, refundRows, eventRows] =
		await Promise.all([
			db.execute<{
				branch_id: string | null;
				branch_name: string | null;
				canceled_at: Date | null;
				client_email: string;
				client_id: string;
				client_name: string;
				client_phone: string | null;
				created_at: Date;
				delivered_at: Date | null;
				id: string;
				nfe_number: string | null;
				customer_notes: string | null;
				nfe_status: string | null;
				nfe_url: string | null;
				nfe_xml_url: string | null;
				number: string;
				paid_at: Date | null;
				payment_method: string | null;
				payment_provider_ref: string | null;
				payment_receipt_url: string | null;
				shipping_address: ShippingAddressSnapshot;
				shipping_amount: string;
				shipping_method: string | null;
				shipping_tracking_code: string | null;
				shipping_unverified: boolean;
				shipped_at: Date | null;
				status: OrderStatus;
				subtotal_amount: string;
				total_amount: string;
				discount_amount: string;
				client_document: string | null;
				client_image: string | null;
				client_type: string | null;
				preparing_at: Date | null;
			}>(sql`
			SELECT
				o.id,
				o.number,
				o.status,
				o.payment_method,
				o.payment_provider_ref,
				o.subtotal_amount,
				o.shipping_amount,
				o.total_amount,
				o.discount_amount,
				o.shipping_address,
				o.shipping_method,
				o.shipping_tracking_code,
				o.shipping_unverified,
				o.created_at,
				o.paid_at,
				o.preparing_at,
				o.shipped_at,
				o.delivered_at,
				o.canceled_at,
				o.branch_id,
				o.payment_receipt_url,
				o.nfe_number,
				o.nfe_url,
				o.nfe_xml_url,
				o.nfe_status,
				o.notes AS customer_notes,
				c.id AS client_id,
				c.name AS client_name,
				c.email AS client_email,
				c.phone AS client_phone,
				c.document AS client_document,
				c.image AS client_image,
				c.client_type AS client_type,
				b.name AS branch_name
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			LEFT JOIN branch b ON b.id = o.branch_id
			WHERE o.id = ${id}
			LIMIT 1
		`),
			db
				.select()
				.from(orderItem)
				.where(eq(orderItem.orderId, id))
				.orderBy(asc(orderItem.name)),
			db
				.select({
					actorType: orderStatusHistory.actorType,
					actorUserName: user.name,
					createdAt: orderStatusHistory.createdAt,
					fromStatus: orderStatusHistory.fromStatus,
					id: orderStatusHistory.id,
					reason: orderStatusHistory.reason,
					toStatus: orderStatusHistory.toStatus,
				})
				.from(orderStatusHistory)
				.leftJoin(user, eq(orderStatusHistory.actorUserId, user.id))
				.where(eq(orderStatusHistory.orderId, id))
				.orderBy(desc(orderStatusHistory.createdAt)),
			db
				.select({
					authorName: user.name,
					body: orderNote.body,
					createdAt: orderNote.createdAt,
					id: orderNote.id,
					pinned: orderNote.pinned,
					statusAtCreation: orderNote.statusAtCreation,
				})
				.from(orderNote)
				.leftJoin(user, eq(orderNote.authorId, user.id))
				.where(eq(orderNote.orderId, id))
				.orderBy(desc(orderNote.createdAt)),
			db
				.select({
					id: orderAttachment.id,
					fileUrl: orderAttachment.fileUrl,
					fileName: orderAttachment.fileName,
					description: orderAttachment.description,
					fileSize: orderAttachment.fileSize,
					mimeType: orderAttachment.mimeType,
					label: orderAttachment.label,
					createdAt: orderAttachment.createdAt,
					uploaderName: user.name,
				})
				.from(orderAttachment)
				.leftJoin(user, eq(orderAttachment.uploadedBy, user.id))
				.where(eq(orderAttachment.orderId, id))
				.orderBy(desc(orderAttachment.createdAt)),
			db
				.select({
					id: refundRequest.id,
					reasonCategory: refundRequest.reasonCategory,
					reasonText: refundRequest.reasonText,
					status: refundRequest.status,
					amount: refundRequest.amount,
					asaasRefundRef: refundRequest.asaasRefundRef,
					rejectionReason: refundRequest.rejectionReason,
					requestedAt: refundRequest.requestedAt,
					resolvedAt: refundRequest.resolvedAt,
				})
				.from(refundRequest)
				.where(eq(refundRequest.orderId, id))
				.orderBy(desc(refundRequest.requestedAt)),
			db
				.select({
					id: orderEvent.id,
					eventType: orderEvent.eventType,
					metadata: orderEvent.metadata,
					actorType: orderEvent.actorType,
					actorUserName: user.name,
					createdAt: orderEvent.createdAt,
				})
				.from(orderEvent)
				.leftJoin(user, eq(orderEvent.actorUserId, user.id))
				.where(eq(orderEvent.orderId, id))
				.orderBy(desc(orderEvent.createdAt)),
		]);

	const row = base.rows[0];
	if (!row) {
		return null;
	}
	// Branch-scoping: pedido fora do escopo do staff é invisível (404), inclusive triagem p/ user.
	if (!orderInScope(scope, row.branch_id)) {
		return null;
	}

	// Private bucket: persist storage paths, sign on read (1-hour TTL).
	const attachments: OrderAttachmentItem[] = await Promise.all(
		attachmentRows.map(async (att) => ({
			id: att.id,
			fileName: att.fileName,
			fileSize: att.fileSize,
			mimeType: att.mimeType,
			label: att.label,
			description: att.description,
			createdAt: att.createdAt,
			uploaderName: att.uploaderName ?? "Sistema",
			url: await createSignedUrl(ORDER_DOCUMENTS_BUCKET, att.fileUrl),
		}))
	);

	return {
		attachments,
		id: row.id,
		number: row.number,
		status: row.status,
		clientId: row.client_id,
		clientName: row.client_name,
		clientImage: row.client_image,
		customerNotes: row.customer_notes,
		clientEmail: row.client_email,
		clientPhone: row.client_phone,
		clientDocument: row.client_document,
		clientType: row.client_type,
		discountAmount: Number(row.discount_amount),
		branchId: row.branch_id,
		branchName: row.branch_name,
		paymentMethod: row.payment_method,
		paymentProviderRef: row.payment_provider_ref,
		paymentReceiptUrl: row.payment_receipt_url,
		nfeNumber: row.nfe_number,
		nfeUrl: row.nfe_url,
		nfeXmlUrl: row.nfe_xml_url,
		nfeStatus: row.nfe_status,
		subtotalAmount: Number(row.subtotal_amount),
		shippingAmount: Number(row.shipping_amount),
		totalAmount: Number(row.total_amount),
		shippingAddress: row.shipping_address ?? {},
		shippingMethod: row.shipping_method,
		shippingTrackingCode: row.shipping_tracking_code,
		shippingUnverified: row.shipping_unverified,
		createdAt: toDate(row.created_at),
		paidAt: toDate(row.paid_at),
		preparingAt: toDate(row.preparing_at),
		shippedAt: toDate(row.shipped_at),
		deliveredAt: toDate(row.delivered_at),
		canceledAt: toDate(row.canceled_at),
		items: items.map((item) => ({
			id: item.id,
			orderId: item.orderId,
			toolId: item.toolId,
			sku: item.sku,
			name: item.name,
			model: item.model,
			voltage: item.voltage,
			unitPrice: Number(item.unitPrice),
			quantity: item.quantity,
			lineTotal: Number(item.lineTotal),
			discountAmount: Number(item.discountAmount),
			ncm: item.ncm,
			cest: item.cest,
			manufacturerName: item.manufacturerName,
			weightKg: parseNumber(item.weightKg),
			lengthCm: parseNumber(item.lengthCm),
			widthCm: parseNumber(item.widthCm),
			heightCm: parseNumber(item.heightCm),
		})),
		history: history.map((entry) => ({
			id: entry.id,
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			reason: entry.reason,
			createdAt: entry.createdAt,
			actorLabel: formatActorLabel(entry),
		})),
		notes: notes.map((note) => ({
			id: note.id,
			body: note.body,
			createdAt: note.createdAt,
			authorName: note.authorName ?? "Sistema",
			pinned: note.pinned,
			statusAtCreation: note.statusAtCreation,
		})),
		refundRequests: refundRows.map((r) => ({
			id: r.id,
			reasonCategory: r.reasonCategory,
			reasonText: r.reasonText,
			status: r.status,
			amount: Number(r.amount),
			asaasRefundRef: r.asaasRefundRef,
			rejectionReason: r.rejectionReason,
			requestedAt: r.requestedAt,
			resolvedAt: r.resolvedAt,
		})),
		events: eventRows.map((e) => ({
			id: e.id,
			eventType: e.eventType,
			metadata: (e.metadata ?? null) as Record<string, unknown> | null,
			actorLabel: formatActorLabel({
				actorType: e.actorType,
				actorUserName: e.actorUserName,
			}),
			createdAt: e.createdAt,
		})),
	};
}

export interface OrderKpis {
	averageTicket: number;
	paidPercent: number;
	revenueToday: number;
	revenueYesterday: number;
}

export async function getOrderKpis(): Promise<OrderKpis> {
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (isBlindScope(scope)) {
		return {
			revenueToday: 0,
			revenueYesterday: 0,
			averageTicket: 0,
			paidPercent: 0,
		};
	}

	// Query usa FROM "order" sem alias → condição referencia branch_id diretamente.
	const branchFilter = orderBranchConditionNoAlias(scope);

	const result = await db.execute<{
		revenue_today: string | null;
		revenue_yesterday: string | null;
		average_ticket: string | null;
		paid_percent: string | null;
	}>(sql`
		SELECT
			SUM(total_amount) FILTER (
				WHERE status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
				AND created_at::date = CURRENT_DATE
			) AS revenue_today,
			SUM(total_amount) FILTER (
				WHERE status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
				AND created_at::date = CURRENT_DATE - INTERVAL '1 day'
			) AS revenue_yesterday,
			AVG(total_amount) FILTER (
				WHERE status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
				AND created_at > now() - INTERVAL '30 days'
			) AS average_ticket,
			CASE
				WHEN COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') = 0 THEN 0
				ELSE (
					COUNT(*) FILTER (
						WHERE status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
						AND created_at > now() - INTERVAL '30 days'
					)::numeric
					/ COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')::numeric
					* 100
				)
			END AS paid_percent
		FROM "order"
		${branchFilter ? sql`WHERE ${branchFilter}` : sql``}
	`);

	const row = result.rows[0];
	return {
		revenueToday: Number(row?.revenue_today ?? 0),
		revenueYesterday: Number(row?.revenue_yesterday ?? 0),
		averageTicket: Number(row?.average_ticket ?? 0),
		paidPercent: Number(row?.paid_percent ?? 0),
	};
}
