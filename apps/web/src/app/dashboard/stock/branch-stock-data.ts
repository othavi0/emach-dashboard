import { db } from "@emach/db";
import { sql } from "drizzle-orm";

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

interface BranchStockDbRow extends Record<string, unknown> {
	image_url: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_id: string;
	tool_name: string;
	variant_id: string;
	voltage: string | null;
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
		? sql`WHERE t.name ILIKE ${`%${trimmedSearch}%`} OR tv.sku ILIKE ${`%${trimmedSearch}%`}`
		: sql``;

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id,
			t.name AS tool_name,
			tv.id AS variant_id,
			tv.sku,
			tv.voltage::text AS voltage,
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
		JOIN tool_variant tv ON tv.tool_id = t.id
		LEFT JOIN stock_level sl
			ON sl.variant_id = tv.id
			AND sl.branch_id = ${branchId}
		${whereClause}
		ORDER BY t.name ASC, tv.sort_order ASC
	`);

	return result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		variantId: row.variant_id,
		sku: row.sku,
		voltage: row.voltage,
		imageUrl: row.image_url,
		quantity: Number(row.quantity ?? 0),
		minQty: Number(row.min_qty ?? 0),
		reorderPoint: Number(row.reorder_point ?? 0),
	}));
}
