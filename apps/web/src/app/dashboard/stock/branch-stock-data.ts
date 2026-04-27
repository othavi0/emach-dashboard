import { db } from "@emach/db";
import { sql } from "drizzle-orm";

export interface BranchStockRow {
	imageUrl: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	sku: string | null;
	toolId: string;
	toolName: string;
}

interface BranchStockDbRow extends Record<string, unknown> {
	image_url: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string | null;
	tool_id: string;
	tool_name: string;
}

export async function fetchBranchStockRows({
	branchId,
	search,
}: {
	branchId: string;
	search?: string;
}): Promise<BranchStockRow[]> {
	const trimmedSearch = search?.trim();
	const whereClause = trimmedSearch
		? sql`WHERE t.name ILIKE ${`%${trimmedSearch}%`} OR t.sku ILIKE ${`%${trimmedSearch}%`}`
		: sql``;

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id,
			t.name AS tool_name,
			t.sku,
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			COALESCE(sl.quantity, 0)::int AS quantity,
			COALESCE(sl.min_qty, 0)::int AS min_qty,
			COALESCE(sl.reorder_point, 0)::int AS reorder_point
		FROM tool t
		LEFT JOIN stock_level sl
			ON sl.tool_id = t.id
			AND sl.branch_id = ${branchId}
		${whereClause}
		ORDER BY t.name ASC
	`);

	return result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		sku: row.sku,
		imageUrl: row.image_url,
		quantity: Number(row.quantity ?? 0),
		minQty: Number(row.min_qty ?? 0),
		reorderPoint: Number(row.reorder_point ?? 0),
	}));
}
