import { db } from "@emach/db";
import { apiKey } from "@emach/db/schema/api-keys";
import { user } from "@emach/db/schema/auth";
import { branch } from "@emach/db/schema/inventory";

export type { OrderStatus } from "@emach/db/schema/orders";

import {
	type OrderStatus,
	orderItem,
	orderNote,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ORDER_TABS } from "./status-meta";

export const ORDERS_PAGE_SIZE = 20;

export interface OrderListFilters {
	branchId?: string;
	from?: string;
	page?: number;
	q?: string;
	tab?: string;
	to?: string;
}

export interface OrderListItem {
	branchName: string | null;
	clientName: string;
	createdAt: Date;
	id: string;
	number: string;
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
	id: string;
	name: string;
}

export interface OrderDetailItem {
	cost: number | null;
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
	branchId: string | null;
	branchName: string | null;
	canceledAt: Date | null;
	clientEmail: string;
	clientId: string;
	clientName: string;
	clientPhone: string | null;
	createdAt: Date;
	deliveredAt: Date | null;
	history: OrderHistoryItem[];
	id: string;
	items: OrderDetailItem[];
	notes: OrderNoteItem[];
	number: string;
	paidAt: Date | null;
	paymentMethod: string | null;
	paymentProviderRef: string | null;
	paymentStatus: string;
	shippedAt: Date | null;
	shippingAddress: ShippingAddressSnapshot;
	shippingAmount: number;
	shippingMethod: string | null;
	shippingTrackingCode: string | null;
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
	return ORDER_TABS.find((item) => item.key === tab) ?? ORDER_TABS[0];
}

function formatActorLabel(entry: {
	actorApiKeyName: string | null;
	actorType: "apiKey" | "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	if (entry.actorType === "apiKey") {
		return entry.actorApiKeyName ?? "API key";
	}
	return entry.actorUserName ?? "Usuário";
}

export function getOrderTab(tab?: string): (typeof ORDER_TABS)[number] {
	return resolveTab(tab);
}

export function getOrderTabCountsKey(status: OrderStatus): string {
	return status;
}

export function listOrderBranches(): Promise<BranchOption[]> {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.orderBy(asc(branch.name));
}

export async function listOrders(
	filters: OrderListFilters
): Promise<OrderListResult> {
	const tab = resolveTab(filters.tab);
	const page = Math.max(1, filters.page ?? 1);
	const offset = (page - 1) * ORDERS_PAGE_SIZE;
	const conditions = [] as ReturnType<typeof sql>[];
	const query = filters.q?.trim();
	const from = normalizeDateParam(filters.from);
	const to = normalizeDateParam(filters.to);

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
		number: string;
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
			c.name AS client_name,
			b.name AS branch_name,
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
			createdAt: row.created_at,
			clientName: row.client_name,
			branchName: row.branch_name,
		})),
		page,
		total,
		totalPages,
	};
}

export interface OrdersMetrics {
	avgTicket30d: number;
	statusBreakdown: Record<OrderStatus, number>;
	todayCount: number;
	todayTotal: number;
	weekCount: number;
	weekTotal: number;
}

export async function getOrdersMetrics(): Promise<OrdersMetrics> {
	const result = await db.execute<{
		today_count: number;
		today_total: string;
		week_count: number;
		week_total: string;
		avg_ticket_30d: string;
		status_breakdown: Record<string, number>;
	}>(sql`
		WITH base AS (
			SELECT id, status, total_amount, created_at FROM "order"
		),
		breakdown AS (
			SELECT jsonb_object_agg(status, count) AS status_breakdown
			FROM (SELECT status, COUNT(*)::int AS count FROM base GROUP BY status) s
		)
		SELECT
			COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_count,
			COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::text AS today_total,
			COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::int AS week_count,
			COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('week', now())), 0)::text AS week_total,
			COALESCE(AVG(total_amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::text AS avg_ticket_30d,
			(SELECT status_breakdown FROM breakdown) AS status_breakdown
		FROM base
	`);

	const row = result.rows[0];
	const emptyBreakdown: Record<OrderStatus, number> = {
		pending_payment: 0,
		paid: 0,
		preparing: 0,
		shipped: 0,
		delivered: 0,
		canceled: 0,
		refunded: 0,
	};
	const breakdownRaw = row?.status_breakdown ?? {};
	const statusBreakdown = { ...emptyBreakdown };
	for (const [k, v] of Object.entries(breakdownRaw)) {
		if (k in emptyBreakdown) {
			statusBreakdown[k as OrderStatus] = Number(v);
		}
	}

	return {
		todayCount: Number(row?.today_count ?? 0),
		todayTotal: Number(row?.today_total ?? 0),
		weekCount: Number(row?.week_count ?? 0),
		weekTotal: Number(row?.week_total ?? 0),
		avgTicket30d: Number(row?.avg_ticket_30d ?? 0),
		statusBreakdown,
	};
}

export async function getOrdersTabCounts(): Promise<Record<string, number>> {
	const result = await db.execute<Record<string, number>>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM "order") AS all_count,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'pending_payment') AS pending_payment,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'paid') AS paid,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'preparing') AS preparing,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'shipped') AS shipped,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'delivered') AS delivered,
			(SELECT COUNT(*)::int FROM "order" WHERE status IN ('canceled', 'refunded')) AS canceled
	`);

	return (
		result.rows[0] ?? {
			all_count: 0,
			pending_payment: 0,
			paid: 0,
			preparing: 0,
			shipped: 0,
			delivered: 0,
			canceled: 0,
		}
	);
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
	const [base, items, history, notes] = await Promise.all([
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
			number: string;
			paid_at: Date | null;
			payment_method: string | null;
			payment_provider_ref: string | null;
			payment_status: string;
			shipping_address: ShippingAddressSnapshot;
			shipping_amount: string;
			shipping_method: string | null;
			shipping_tracking_code: string | null;
			shipped_at: Date | null;
			status: OrderStatus;
			subtotal_amount: string;
			total_amount: string;
		}>(sql`
			SELECT
				o.id,
				o.number,
				o.status,
				o.payment_status,
				o.payment_method,
				o.payment_provider_ref,
				o.subtotal_amount,
				o.shipping_amount,
				o.total_amount,
				o.shipping_address,
				o.shipping_method,
				o.shipping_tracking_code,
				o.created_at,
				o.paid_at,
				o.shipped_at,
				o.delivered_at,
				o.canceled_at,
				o.branch_id,
				c.id AS client_id,
				c.name AS client_name,
				c.email AS client_email,
				c.phone AS client_phone,
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
				actorApiKeyName: apiKey.name,
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
			.leftJoin(apiKey, eq(orderStatusHistory.actorApiKeyId, apiKey.id))
			.where(eq(orderStatusHistory.orderId, id))
			.orderBy(desc(orderStatusHistory.createdAt)),
		db
			.select({
				authorName: user.name,
				body: orderNote.body,
				createdAt: orderNote.createdAt,
				id: orderNote.id,
			})
			.from(orderNote)
			.innerJoin(user, eq(orderNote.authorId, user.id))
			.where(eq(orderNote.orderId, id))
			.orderBy(desc(orderNote.createdAt)),
	]);

	const row = base.rows[0];
	if (!row) {
		return null;
	}

	return {
		id: row.id,
		number: row.number,
		status: row.status,
		clientId: row.client_id,
		clientName: row.client_name,
		clientEmail: row.client_email,
		clientPhone: row.client_phone,
		branchId: row.branch_id,
		branchName: row.branch_name,
		paymentStatus: row.payment_status,
		paymentMethod: row.payment_method,
		paymentProviderRef: row.payment_provider_ref,
		subtotalAmount: Number(row.subtotal_amount),
		shippingAmount: Number(row.shipping_amount),
		totalAmount: Number(row.total_amount),
		shippingAddress: row.shipping_address ?? {},
		shippingMethod: row.shipping_method,
		shippingTrackingCode: row.shipping_tracking_code,
		createdAt: row.created_at,
		paidAt: row.paid_at,
		shippedAt: row.shipped_at,
		deliveredAt: row.delivered_at,
		canceledAt: row.canceled_at,
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
			cost: parseNumber(item.cost),
			ncm: item.ncm,
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
			authorName: note.authorName ?? "Usuário",
		})),
	};
}
