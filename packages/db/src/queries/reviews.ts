import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { order, orderItem } from "../schema/orders";
import { review } from "../schema/reviews";

export const REVIEW_WINDOW_DAYS = 90;

export type CanCreateReviewInput = {
	clientId: string;
	orderId: string;
	toolId: string;
};

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

type AnyDb = NodePgDatabase<Record<string, unknown>>;

export async function canCreateReview(
	db: AnyDb,
	input: CanCreateReviewInput
): Promise<CanCreateReviewResult> {
	const { clientId, orderId, toolId } = input;

	const [ord] = await db
		.select({
			id: order.id,
			clientId: order.clientId,
			paymentStatus: order.paymentStatus,
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
	if (ord.paymentStatus !== "paid" || !ord.paidAt) {
		return { ok: false, reason: "not_paid" };
	}

	const windowRows = await db.execute<{ expired: boolean }>(sql`
		SELECT (now() AT TIME ZONE 'UTC') >
			(${ord.paidAt}::timestamp AT TIME ZONE 'UTC'
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
