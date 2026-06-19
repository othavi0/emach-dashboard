import "server-only";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";
import { getUserBranchScope, inScope } from "@/lib/branch-scope";
import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";

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

export type BranchStockSort = "urgency" | "name" | "stockLow" | "stockHigh";
export type BranchStockStatus = "all" | "critical" | "reorder" | "ok";

export interface BranchStockFiltersInput {
	branchId: string;
	categoryId?: string;
	search?: string;
	sort: BranchStockSort;
	status?: BranchStockStatus;
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

function buildBranchCursorPredicate(
	decoded: ReturnType<typeof decodeCursor> | null,
	sort: BranchStockSort
) {
	if (!decoded) {
		return null;
	}
	if (sort === "name" && decoded.sort === "name") {
		return sql`(t.name, tv.id) > (${decoded.name}, ${decoded.id})`;
	}
	if (sort === "stockLow" && decoded.sort === "stockLow") {
		return sql`(COALESCE(sl.quantity, 0), tv.id) > (${decoded.totalStock}, ${decoded.id})`;
	}
	if (sort === "stockHigh" && decoded.sort === "stockHigh") {
		return sql`(COALESCE(sl.quantity, 0), tv.id) < (${decoded.totalStock}, ${decoded.id})`;
	}
	// "urgency": sem cursor persistido
	return null;
}

function buildBranchOrderClause(sort: BranchStockSort) {
	if (sort === "name") {
		return sql`ORDER BY t.name ASC, tv.id ASC`;
	}
	if (sort === "stockLow") {
		return sql`ORDER BY COALESCE(sl.quantity, 0) ASC, tv.id ASC`;
	}
	if (sort === "stockHigh") {
		return sql`ORDER BY COALESCE(sl.quantity, 0) DESC, tv.id DESC`;
	}
	// "urgency" (default): crítico → repor → ok; dentro de cada grupo, quantidade ASC
	return sql`ORDER BY
		CASE
			WHEN COALESCE(sl.quantity, 0) <= COALESCE(sl.min_qty, 0) AND COALESCE(sl.min_qty, 0) > 0 THEN 1
			WHEN COALESCE(sl.quantity, 0) > COALESCE(sl.min_qty, 0)
				AND COALESCE(sl.quantity, 0) <= COALESCE(sl.reorder_point, 0)
				AND COALESCE(sl.reorder_point, 0) > 0 THEN 2
			ELSE 3
		END ASC,
		COALESCE(sl.quantity, 0) ASC,
		tv.id ASC`;
}

function buildBranchStatusPredicate(status: BranchStockStatus | undefined) {
	if (status === "critical") {
		return sql`(COALESCE(sl.quantity, 0) <= COALESCE(sl.min_qty, 0) AND COALESCE(sl.min_qty, 0) > 0)`;
	}
	if (status === "reorder") {
		return sql`(
			COALESCE(sl.quantity, 0) > COALESCE(sl.min_qty, 0)
			AND COALESCE(sl.quantity, 0) <= COALESCE(sl.reorder_point, 0)
			AND COALESCE(sl.reorder_point, 0) > 0
		)`;
	}
	if (status === "ok") {
		return sql`(
			COALESCE(sl.quantity, 0) > COALESCE(sl.reorder_point, 0)
			OR (COALESCE(sl.min_qty, 0) = 0 AND COALESCE(sl.reorder_point, 0) = 0)
		)`;
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
	const scope = await getUserBranchScope(await requireCurrentSession());
	if (!inScope(scope, filters.branchId)) {
		return { items: [], nextCursor: null };
	}
	const decoded = cursor ? decodeCursor(cursor) : null;
	const trimmedSearch = filters.search?.trim();

	const whereParts: ReturnType<typeof sql>[] = [];

	if (trimmedSearch) {
		whereParts.push(
			sql`(t.name ILIKE ${`%${trimmedSearch}%`} OR tv.sku ILIKE ${`%${trimmedSearch}%`})`
		);
	}

	if (filters.categoryId) {
		whereParts.push(
			sql`EXISTS (
				SELECT 1 FROM tool_category tc
				WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId}
			)`
		);
	}

	const statusPred = buildBranchStatusPredicate(filters.status);
	if (statusPred) {
		whereParts.push(statusPred);
	}

	const cursorPred = buildBranchCursorPredicate(decoded, filters.sort);
	if (cursorPred) {
		whereParts.push(cursorPred);
	}

	const whereClause = whereParts.length
		? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
		: sql``;

	const orderClause = buildBranchOrderClause(filters.sort);

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id,
			t.name AS tool_name,
			tv.id AS variant_id,
			tv.sku,
			tv.voltage::text AS voltage,
			(
				SELECT ti.url FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			COALESCE(sl.quantity, 0)::int AS quantity,
			COALESCE(sl.min_qty, 0)::int AS min_qty,
			COALESCE(sl.reorder_point, 0)::int AS reorder_point
		FROM tool t
		JOIN tool_variant tv ON tv.tool_id = t.id
		LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	// "urgency" sort tem nextCursor null (sem cursor keyset — carregada de uma vez).
	// Os demais sorts usam paginate() normalmente.
	if (filters.sort === "urgency") {
		const pageRows = result.rows.slice(0, BATCH_SIZE);
		const items: BranchStockRow[] = pageRows.map((row) => ({
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
		return { items, nextCursor: null };
	}

	return paginate(
		result.rows,
		(row) => ({
			toolId: row.tool_id,
			toolName: row.tool_name,
			variantId: row.variant_id,
			sku: row.sku,
			voltage: row.voltage,
			imageUrl: row.image_url,
			quantity: Number(row.quantity ?? 0),
			minQty: Number(row.min_qty ?? 0),
			reorderPoint: Number(row.reorder_point ?? 0),
		}),
		(last) => {
			if (filters.sort === "name") {
				return {
					v: 1,
					sort: "name" as const,
					name: last.tool_name,
					id: last.variant_id,
				};
			}
			if (filters.sort === "stockLow") {
				return {
					v: 1,
					sort: "stockLow" as const,
					totalStock: Number(last.quantity ?? 0),
					id: last.variant_id,
				};
			}
			// stockHigh
			return {
				v: 1,
				sort: "stockHigh" as const,
				totalStock: Number(last.quantity ?? 0),
				id: last.variant_id,
			};
		}
	);
}
