import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

export interface ToolReviewSummary {
	avg: number;
	breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
	recent: ToolReviewRecent[];
	total: number;
}

export interface ToolReviewRecent {
	body: string;
	clientName: string;
	createdAt: Date;
	id: string;
	rating: number;
	status: string;
	title: string | null;
}

const EMPTY_BREAKDOWN: Record<1 | 2 | 3 | 4 | 5, number> = {
	1: 0,
	2: 0,
	3: 0,
	4: 0,
	5: 0,
};

export async function getToolReviewsSummary(
	toolId: string
): Promise<ToolReviewSummary> {
	const [aggResult, recent] = await Promise.all([
		db.execute<{
			avg: string | null;
			total: number;
			breakdown: Record<string, number> | null;
		}>(sql`
			SELECT
				AVG(rating) FILTER (WHERE status = 'approved')::text AS avg,
				COUNT(*) FILTER (WHERE status = 'approved')::int AS total,
				(
					SELECT jsonb_object_agg(rating, count)
					FROM (
						SELECT rating, COUNT(*)::int AS count
						FROM review
						WHERE tool_id = ${toolId} AND status = 'approved'
						GROUP BY rating
					) b
				) AS breakdown
			FROM review
			WHERE tool_id = ${toolId}
		`),
		db.execute<{
			id: string;
			rating: number;
			title: string | null;
			body: string;
			status: string;
			client_name: string;
			created_at: Date;
		}>(sql`
			SELECT r.id, r.rating, r.title, r.body, r.status, r.created_at,
				c.name AS client_name
			FROM review r
			JOIN client c ON c.id = r.client_id
			WHERE r.tool_id = ${toolId}
			ORDER BY
				CASE r.status
					WHEN 'approved' THEN 0
					WHEN 'pending' THEN 1
					WHEN 'rejected' THEN 2
					WHEN 'spam' THEN 3
				END,
				r.created_at DESC
			LIMIT 10
		`),
	]);

	const aggRow = aggResult.rows[0];
	const breakdown = { ...EMPTY_BREAKDOWN };
	for (const [k, v] of Object.entries(aggRow?.breakdown ?? {})) {
		const n = Number(k);
		if (n >= 1 && n <= 5) {
			breakdown[n as 1 | 2 | 3 | 4 | 5] = Number(v);
		}
	}

	return {
		avg: aggRow?.avg ? Number(aggRow.avg) : 0,
		total: Number(aggRow?.total ?? 0),
		breakdown,
		recent: recent.rows.map((r) => ({
			id: r.id,
			rating: Number(r.rating),
			title: r.title,
			body: r.body,
			status: r.status,
			clientName: r.client_name,
			createdAt: toDate(r.created_at),
		})),
	};
}
