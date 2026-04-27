import { db } from "@emach/db";

export type { ReviewStatus } from "@emach/db/schema/reviews";

import type { ReviewStatus } from "@emach/db/schema/reviews";
import { sql } from "drizzle-orm";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	pending: "Pendente",
	approved: "Aprovada",
	rejected: "Rejeitada",
	spam: "Spam",
};

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

export async function listReviews(status?: string): Promise<ReviewListItem[]> {
	const normalizedStatus =
		status === "approved" ||
		status === "rejected" ||
		status === "spam" ||
		status === "pending"
			? status
			: "pending";

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
		JOIN tool t ON t.id = r.tool_id
		WHERE ${status ? sql`r.status = ${normalizedStatus}` : sql`TRUE`}
		ORDER BY r.created_at DESC
	`);

	return rows.rows.map((row) => ({
		id: row.id,
		toolName: row.tool_name,
		clientName: row.client_name,
		rating: row.rating,
		status: row.status,
		createdAt: row.created_at,
		imageUrl: row.image_url,
		bodyPreview:
			row.body.length > 80 ? `${row.body.slice(0, 77).trimEnd()}...` : row.body,
	}));
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
		moderatedAt: row.moderated_at,
		moderatedByName: row.moderated_by_name,
		createdAt: row.created_at,
		imageUrl: row.image_url,
	};
}
