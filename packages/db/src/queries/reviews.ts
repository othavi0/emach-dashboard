import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { order, orderItem } from "../schema/orders";
import type { Review } from "../schema/reviews";
import { review } from "../schema/reviews";
import { coerceDates } from "../utils";
import type { AnyDb } from "./catalog-helpers";
import {
	APPROVED,
	formatReviewerName,
	REVIEW_DATE_KEYS,
} from "./catalog-helpers";

export const REVIEW_WINDOW_DAYS = 90;

export interface CanCreateReviewInput {
	clientId: string;
	orderId: string;
	toolId: string;
}

export type CanCreateReviewReason =
	| "order_not_found"
	| "order_not_owned_by_client"
	| "not_paid"
	| "window_expired"
	| "tool_not_in_order"
	| "already_reviewed";

export type CanCreateReviewResult =
	| { ok: true }
	| { ok: false; reason: CanCreateReviewReason };

type LocalAnyDb = NodePgDatabase<Record<string, unknown>>;

export async function canCreateReview(
	db: LocalAnyDb,
	input: CanCreateReviewInput
): Promise<CanCreateReviewResult> {
	const { clientId, orderId, toolId } = input;

	const [ord] = await db
		.select({
			id: order.id,
			clientId: order.clientId,
			paidAt: order.paidAt,
		})
		.from(order)
		.where(eq(order.id, orderId))
		.limit(1);

	if (!ord) {
		return { ok: false, reason: "order_not_found" };
	}
	if (ord.clientId !== clientId) {
		return { ok: false, reason: "order_not_owned_by_client" };
	}
	if (!ord.paidAt) {
		return { ok: false, reason: "not_paid" };
	}

	const windowRows = await db.execute<{ expired: boolean }>(sql`
		SELECT (now() AT TIME ZONE 'UTC') >
			(${ord.paidAt}::timestamptz AT TIME ZONE 'UTC'
				+ make_interval(days => ${REVIEW_WINDOW_DAYS}))
			AS expired
	`);
	const expired = windowRows.rows[0]?.expired === true;
	if (expired) {
		return { ok: false, reason: "window_expired" };
	}

	const [item] = await db
		.select({ id: orderItem.id })
		.from(orderItem)
		.where(and(eq(orderItem.orderId, orderId), eq(orderItem.toolId, toolId)))
		.limit(1);

	if (!item) {
		return { ok: false, reason: "tool_not_in_order" };
	}

	const [existing] = await db
		.select({ id: review.id })
		.from(review)
		.where(
			and(
				eq(review.clientId, clientId),
				eq(review.orderId, orderId),
				eq(review.toolId, toolId)
			)
		)
		.limit(1);

	if (existing) {
		return { ok: false, reason: "already_reviewed" };
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// Types for reviews context (migrated from catalog.ts)
// ---------------------------------------------------------------------------

export interface GetReviewsInput {
	limit?: number;
	page: number;
	sort: "newest" | "rating-desc";
	toolId: string;
}

export type ReviewWithReviewer = Review & {
	clientName: string;
};

export interface ReviewStats {
	avg: number | null;
	count: number;
	distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

// ---------------------------------------------------------------------------
// getReviews
// ---------------------------------------------------------------------------

export async function getReviews(
	db: AnyDb,
	input: GetReviewsInput
): Promise<{ reviews: ReviewWithReviewer[]; total: number }> {
	const limit = input.limit ?? 10;
	const offset = (Math.max(1, input.page) - 1) * limit;
	const order2 =
		input.sort === "rating-desc"
			? sql`r.rating DESC, r.created_at DESC`
			: sql`r.created_at DESC`;

	const [listRes, countRes] = await Promise.all([
		db.execute<Review & { client_name: string }>(sql`
			SELECT
				r.id, r.tool_id AS "toolId", r.client_id AS "clientId",
				r.order_id AS "orderId", r.rating, r.title, r.body, r.status,
				r.moderated_by AS "moderatedBy", r.moderated_at AS "moderatedAt",
				r.moderation_note AS "moderationNote",
				r.created_at AS "createdAt", r.updated_at AS "updatedAt",
				c.name AS client_name
			FROM review r
			INNER JOIN client c ON c.id = r.client_id
			WHERE r.tool_id = ${input.toolId} AND r.status = ${APPROVED}
			ORDER BY ${order2}
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ total: number | string }>(sql`
			SELECT COUNT(*)::int AS total
			FROM review r
			WHERE r.tool_id = ${input.toolId} AND r.status = ${APPROVED}
		`),
	]);

	const reviews: ReviewWithReviewer[] = listRes.rows.map((row) => {
		const { client_name, ...rest } = row;
		const rev = coerceDates(rest as Review, REVIEW_DATE_KEYS);
		return {
			...rev,
			clientName: formatReviewerName(client_name),
		};
	});

	return { reviews, total: Number(countRes.rows[0]?.total ?? 0) };
}

// ---------------------------------------------------------------------------
// getReviewStats
// ---------------------------------------------------------------------------

export async function getReviewStats(
	db: AnyDb,
	toolId: string
): Promise<ReviewStats> {
	const result = await db.execute<{
		avg_rating: string | null;
		review_count: number | string;
		c1: number | string;
		c2: number | string;
		c3: number | string;
		c4: number | string;
		c5: number | string;
	}>(sql`
		SELECT
			AVG(rating)::numeric(3,2)::text AS avg_rating,
			COUNT(*)::int AS review_count,
			COUNT(*) FILTER (WHERE rating = 1)::int AS c1,
			COUNT(*) FILTER (WHERE rating = 2)::int AS c2,
			COUNT(*) FILTER (WHERE rating = 3)::int AS c3,
			COUNT(*) FILTER (WHERE rating = 4)::int AS c4,
			COUNT(*) FILTER (WHERE rating = 5)::int AS c5
		FROM review
		WHERE tool_id = ${toolId} AND status = ${APPROVED}
	`);

	const row = result.rows[0];
	const count = Number(row?.review_count ?? 0);

	return {
		avg: count > 0 ? toNullableNumber(row?.avg_rating) : null,
		count,
		distribution: {
			1: Number(row?.c1 ?? 0),
			2: Number(row?.c2 ?? 0),
			3: Number(row?.c3 ?? 0),
			4: Number(row?.c4 ?? 0),
			5: Number(row?.c5 ?? 0),
		},
	};
}

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}
