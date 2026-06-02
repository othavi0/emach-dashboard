import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";

export type { ReviewStatus } from "@emach/db/schema/reviews";

import type { ReviewStatus } from "@emach/db/schema/reviews";
import { type SQL, sql } from "drizzle-orm";

export interface ReviewListItem {
	bodyPreview: string;
	clientName: string;
	createdAt: Date;
	id: string;
	imageUrl: string | null;
	rating: number;
	status: ReviewStatus;
	toolName: string;
}

export interface ReviewDetail {
	body: string;
	clientEmail: string;
	clientName: string;
	createdAt: Date;
	id: string;
	imageUrl: string | null;
	moderatedAt: Date | null;
	moderatedByName: string | null;
	moderationNote: string | null;
	orderId: string;
	rating: number;
	status: ReviewStatus;
	title: string | null;
	toolId: string;
	toolName: string;
}

/** Filtros compartilhados entre a listagem e a contagem das abas. */
export interface ReviewFilters {
	from?: string;
	q?: string;
	rating?: number;
	to?: string;
}

export interface ListReviewsParams extends ReviewFilters {
	status?: ReviewStatus | null;
}

/**
 * Condições de WHERE comuns (nota, busca, período). O filtro de `status`
 * fica de fora porque a contagem de abas agrupa justamente por status.
 */
function buildReviewConditions({ from, q, rating, to }: ReviewFilters): SQL[] {
	const conditions: SQL[] = [];
	if (rating) {
		conditions.push(sql`r.rating = ${rating}`);
	}
	if (q) {
		const like = `%${q}%`;
		conditions.push(
			sql`(c.name ILIKE ${like} OR t.name ILIKE ${like} OR r.title ILIKE ${like} OR r.body ILIKE ${like})`
		);
	}
	if (from) {
		conditions.push(sql`r.created_at >= ${from}::date`);
	}
	if (to) {
		conditions.push(sql`r.created_at < (${to}::date + INTERVAL '1 day')`);
	}
	return conditions;
}

export async function listReviews({
	status,
	...filters
}: ListReviewsParams = {}): Promise<ReviewListItem[]> {
	const conditions = buildReviewConditions(filters);
	if (status) {
		conditions.push(sql`r.status = ${status}`);
	}
	const whereClause = conditions.length
		? sql` WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const rows = await db.execute<{
		body: string;
		client_name: string;
		created_at: Date;
		id: string;
		image_url: string | null;
		rating: number;
		status: ReviewStatus;
		tool_name: string;
	}>(sql`
		SELECT
			r.id,
			r.rating,
			r.body,
			r.status,
			r.created_at,
			c.name AS client_name,
			t.name AS tool_name,
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url
		FROM review r
		JOIN client c ON c.id = r.client_id
		JOIN tool t ON t.id = r.tool_id${whereClause}
		ORDER BY r.created_at DESC
	`);

	return rows.rows.map((row) => ({
		id: row.id,
		toolName: row.tool_name,
		clientName: row.client_name,
		rating: row.rating,
		status: row.status,
		createdAt: toDate(row.created_at),
		imageUrl: row.image_url,
		bodyPreview:
			row.body.length > 80 ? `${row.body.slice(0, 77).trimEnd()}...` : row.body,
	}));
}

/**
 * Contagem de reviews por status, restrita pelos demais filtros ativos
 * (nota, busca, período). Chaveada por status (pending/approved/rejected/spam).
 */
export async function getReviewsTabCounts(
	filters: ReviewFilters = {}
): Promise<Record<string, number>> {
	const conditions = buildReviewConditions(filters);
	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const result = await db.execute<{ count: number; status: ReviewStatus }>(sql`
		SELECT r.status, COUNT(*)::int AS count
		FROM review r
		JOIN client c ON c.id = r.client_id
		JOIN tool t ON t.id = r.tool_id
		${whereClause}
		GROUP BY r.status
	`);

	const counts: Record<string, number> = {};
	for (const row of result.rows) {
		counts[row.status] = Number(row.count);
	}
	return counts;
}

export async function getReviewDetail(
	id: string
): Promise<ReviewDetail | null> {
	const result = await db.execute<{
		body: string;
		client_email: string;
		client_name: string;
		created_at: Date;
		id: string;
		image_url: string | null;
		moderated_at: Date | null;
		moderated_by_name: string | null;
		moderation_note: string | null;
		order_id: string;
		rating: number;
		status: ReviewStatus;
		title: string | null;
		tool_id: string;
		tool_name: string;
	}>(sql`
		SELECT
			r.id,
			r.tool_id,
			r.order_id,
			r.rating,
			r.title,
			r.body,
			r.status,
			r.moderation_note,
			r.moderated_at,
			r.created_at,
			c.name AS client_name,
			c.email AS client_email,
			t.name AS tool_name,
			u.name AS moderated_by_name,
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url
		FROM review r
		JOIN client c ON c.id = r.client_id
		JOIN tool t ON t.id = r.tool_id
		LEFT JOIN "user" u ON u.id = r.moderated_by
		WHERE r.id = ${id}
		LIMIT 1
	`);

	const row = result.rows[0];
	if (!row) {
		return null;
	}

	return {
		id: row.id,
		toolId: row.tool_id,
		toolName: row.tool_name,
		orderId: row.order_id,
		clientName: row.client_name,
		clientEmail: row.client_email,
		rating: row.rating,
		title: row.title,
		body: row.body,
		status: row.status,
		moderationNote: row.moderation_note,
		moderatedAt: toDate(row.moderated_at),
		moderatedByName: row.moderated_by_name,
		createdAt: toDate(row.created_at),
		imageUrl: row.image_url,
	};
}
