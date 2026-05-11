"use server";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export interface BranchStockRow {
	imageUrl: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolId: string;
	toolName: string;
	variantId: string;
	voltage: string | null;
}

export type BranchStockSort = "newest" | "name";

export interface BranchStockFiltersInput {
	branchId: string;
	search?: string;
	sort: BranchStockSort;
}

interface BranchStockDbRow extends Record<string, unknown> {
	image_url: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_created_at: string;
	tool_id: string;
	tool_name: string;
	variant_id: string;
	voltage: string | null;
}

function buildBranchCursorPredicate(
	decoded: ReturnType<typeof decodeCursor> | null,
	sort: BranchStockSort
) {
	if (!decoded) {
		return null;
	}
	if (sort === "newest" && decoded.sort === "newest") {
		return sql`(t.created_at, tv.id) < (${decoded.createdAt}::timestamp, ${decoded.id})`;
	}
	if (sort === "name" && decoded.sort === "name") {
		return sql`(t.name, tv.id) > (${decoded.name}, ${decoded.id})`;
	}
	return null;
}

export async function fetchBranchStockPage({
	filters,
	cursor,
}: {
	filters: BranchStockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchStockRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const trimmedSearch = filters.search?.trim();

	const whereParts: ReturnType<typeof sql>[] = [];
	if (trimmedSearch) {
		whereParts.push(
			sql`(t.name ILIKE ${`%${trimmedSearch}%`} OR tv.sku ILIKE ${`%${trimmedSearch}%`})`
		);
	}
	const cursorPred = buildBranchCursorPredicate(decoded, filters.sort);
	if (cursorPred) {
		whereParts.push(cursorPred);
	}

	const whereClause = whereParts.length
		? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
		: sql``;

	const orderClause =
		filters.sort === "name"
			? sql`ORDER BY t.name ASC, tv.id ASC`
			: sql`ORDER BY t.created_at DESC, tv.id DESC`;

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id, t.name AS tool_name,
			tv.id AS variant_id, tv.sku, tv.voltage::text AS voltage,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			COALESCE(sl.quantity, 0)::int AS quantity,
			COALESCE(sl.min_qty, 0)::int AS min_qty,
			COALESCE(sl.reorder_point, 0)::int AS reorder_point,
			t.created_at::text AS tool_created_at
		FROM tool t
		JOIN tool_variant tv ON tv.tool_id = t.id
		LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		variantId: row.variant_id,
		sku: row.sku,
		voltage: row.voltage,
		imageUrl: row.image_url,
		quantity: Number(row.quantity ?? 0),
		minQty: Number(row.min_qty ?? 0),
		reorderPoint: Number(row.reorder_point ?? 0),
		__createdAt: row.tool_created_at,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		nextCursor =
			filters.sort === "name"
				? encodeCursor({
						v: 1,
						sort: "name",
						name: last.toolName,
						id: last.variantId,
					})
				: encodeCursor({
						v: 1,
						sort: "newest",
						createdAt: last.__createdAt,
						id: last.variantId,
					});
	}

	const cleanItems: BranchStockRow[] = items.map(
		({ __createdAt: _c, ...rest }) => rest
	);

	return { items: cleanItems, nextCursor };
}
