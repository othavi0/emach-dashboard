import "server-only";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { branchAndFilter, getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import {
	isCategoryComplete,
	MIN_CATEGORY_ATTRIBUTES,
} from "../categories/_lib/category-completeness";
import { getEffectiveAttributeCount } from "../categories/_lib/effective-attributes";
import type { ToolStatusValue } from "./_components/tool-schema";

export type ToolSort = "newest" | "name";
export type ToolsListMode = "catalog" | "repor" | "esgotado";

export interface ToolsFiltersInput {
	branchId?: string;
	categoryId?: string;
	mode?: ToolsListMode;
	ncm?: string;
	search?: string;
	sort: ToolSort;
	status?: string;
	visible?: string;
}

interface ToolPageRow extends Record<string, unknown> {
	branches_breakdown: Array<{
		branch_id: string;
		branch_name: string;
		quantity: number;
	}> | null;
	created_at: string;
	default_sku: string | null;
	default_voltage: string | null;
	id: string;
	image_url: string | null;
	model: string | null;
	name: string;
	primary_category_name: string | null;
	reorder_count: number;
	slug: string | null;
	status: string;
	total_stock: number;
	variant_count: number;
	variant_voltages: string[];
	visible_on_site: boolean;
}

/**
 * Gate de completude: a categoria *principal* define as specs disponíveis (cadeia
 * própria + herdada). Se tiver menos de MIN_CATEGORY_ATTRIBUTES atributos
 * efetivos, nenhuma ferramenta nela conseguiria atingir MIN_SPECS_ACTIVE — então
 * bloqueamos cadastro/edição com a primária incompleta. Devolve a mensagem de
 * erro, ou `null` se a categoria estiver completa.
 */
export async function primaryCategoryIncompleteError(
	primaryCategoryId: string
): Promise<string | null> {
	const effective = await getEffectiveAttributeCount(primaryCategoryId);
	if (isCategoryComplete(effective)) {
		return null;
	}
	return `A categoria principal está incompleta (${effective}/${MIN_CATEGORY_ATTRIBUTES} atributos efetivos). Adicione atributos à categoria antes de cadastrar ou ativar ferramentas nela.`;
}

/** Categoria principal atual da ferramenta (para decidir se o gate se aplica no update). */
export async function currentPrimaryCategoryId(
	toolId: string
): Promise<string | null> {
	const [row] = await db
		.select({ categoryId: toolCategory.categoryId })
		.from(toolCategory)
		.where(
			and(eq(toolCategory.toolId, toolId), eq(toolCategory.isPrimary, true))
		)
		.limit(1);
	return row?.categoryId ?? null;
}

export async function fetchDefinitionsBySlug(
	slugs: string[]
): Promise<Map<string, AttributeDefinition>> {
	if (slugs.length === 0) {
		return new Map();
	}
	const rows = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.slug, slugs));
	return new Map(rows.map((d) => [d.slug, d]));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: construção de cláusula WHERE com múltiplos filtros opcionais e cursor de paginação; complexidade inerente ao domínio
export function buildToolsWhereClause(
	filters: ToolsFiltersInput,
	decoded: ReturnType<typeof decodeCursor> | null
) {
	const whereParts: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		const searchPattern = `%${filters.search}%`;
		whereParts.push(sql`(
			t.name ILIKE ${searchPattern}
			OR EXISTS (SELECT 1 FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.barcode ILIKE ${searchPattern})
		)`);
	}
	if (filters.categoryId) {
		whereParts.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId})`
		);
	}
	if (filters.visible === "true") {
		whereParts.push(sql`t.visible_on_site = true`);
	} else if (filters.visible === "false") {
		whereParts.push(sql`t.visible_on_site = false`);
	}
	if (filters.status) {
		const statuses = filters.status.split(",").filter(Boolean);
		if (statuses.length > 0) {
			const placeholders = sql.join(
				statuses.map((s) => sql`${s}`),
				sql`, `
			);
			whereParts.push(sql`t.status IN (${placeholders})`);
		}
	}
	if (filters.ncm) {
		whereParts.push(sql`t.ncm ILIKE ${`${filters.ncm}%`}`);
	}
	if (filters.mode === "repor") {
		if (filters.branchId) {
			whereParts.push(sql`
				EXISTS (
					SELECT 1 FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id
					AND sl.reorder_point > 0
					AND sl.quantity <= sl.reorder_point
					AND sl.branch_id = ${filters.branchId}
				)
			`);
		} else {
			whereParts.push(sql`
				EXISTS (
					SELECT 1 FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id
					AND sl.reorder_point > 0
					AND sl.quantity <= sl.reorder_point
				)
			`);
		}
	}
	if (filters.mode === "esgotado") {
		// Coerente com o badge "Esgotado": só tools vendáveis (active) sem estoque.
		whereParts.push(sql`t.status = 'active'`);
		whereParts.push(sql`
			NOT EXISTS (
				SELECT 1 FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.quantity > 0
			)
		`);
	}
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			whereParts.push(
				sql`(t.created_at, t.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			);
		} else if (filters.sort === "name" && decoded.sort === "name") {
			whereParts.push(sql`(t.name, t.id) > (${decoded.name}, ${decoded.id})`);
		} else {
			throw new Error("Cursor não condiz com sort");
		}
	}
	return whereParts.length
		? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
		: sql``;
}

export function buildToolsNextCursor(
	sort: ToolSort,
	last: { id: string; __createdAt: string; __name: string }
): string {
	if (sort === "name") {
		return encodeCursor({ v: 1, sort: "name", name: last.__name, id: last.id });
	}
	return encodeCursor({
		v: 1,
		sort: "newest",
		createdAt: last.__createdAt,
		id: last.id,
	});
}

export async function fetchToolsPage({
	filters,
	cursor,
}: {
	filters: ToolsFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);

	const decoded = cursor ? decodeCursor(cursor) : null;
	const whereClause = buildToolsWhereClause(filters, decoded);
	const orderClause =
		filters.sort === "name"
			? sql`ORDER BY t.name ASC, t.id ASC`
			: sql`ORDER BY t.created_at DESC, t.id DESC`;

	// Branch filter fragments for stock subqueries.
	// Prioridade: filtro explícito do usuário > scope do usuário > sem filtro (super_admin).
	const branchStockFilter = filters.branchId
		? sql` AND sl.branch_id = ${filters.branchId}`
		: branchAndFilter(scope, sql`sl.branch_id`);
	const branchStockFilter2 = filters.branchId
		? sql` AND sl2.branch_id = ${filters.branchId}`
		: branchAndFilter(scope, sql`sl2.branch_id`);

	const rows = await db.execute<ToolPageRow>(sql`
		SELECT
			t.id, t.name, t.slug,
			(SELECT tv.sku FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_sku,
			(SELECT tv.voltage::text FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_voltage,
			(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
			(SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
				FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_voltages,
			t.model, t.status,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			t.visible_on_site,
			(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id
				WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS primary_category_name,
			COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id${branchStockFilter}), 0) AS total_stock,
			COALESCE((SELECT COUNT(*)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point${branchStockFilter}), 0) AS reorder_count,
			COALESCE((SELECT json_agg(json_build_object('branch_id', b.id, 'branch_name', b.name, 'quantity', branch_total) ORDER BY b.name ASC)
				FROM (SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
					FROM stock_level sl2 JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
					JOIN branch b2 ON b2.id = sl2.branch_id WHERE tv2.tool_id = t.id${branchStockFilter2} GROUP BY b2.id) g
				JOIN branch b ON b.id = g.bid), '[]'::json) AS branches_breakdown,
			t.created_at::text AS created_at
		FROM tool t
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	return paginate(
		rows.rows,
		(r) =>
			({
				id: r.id,
				name: r.name,
				imageUrl: r.image_url,
				sku: r.default_sku,
				variantCount: Number(r.variant_count ?? 0),
				variantSummaries: (r.variant_voltages ?? []).filter(
					(v): v is string => typeof v === "string"
				),
				primaryCategoryName: r.primary_category_name,
				status: r.status as ToolStatusValue,
				totalStock: Number(r.total_stock ?? 0),
				branches: (r.branches_breakdown ?? []).map((b) => ({
					branchId: b.branch_id,
					branchName: b.branch_name,
					quantity: b.quantity,
				})),
			}) as ToolCardData,
		(last) =>
			filters.sort === "name"
				? { v: 1, sort: "name" as const, name: last.name, id: last.id }
				: {
						v: 1,
						sort: "newest" as const,
						createdAt: last.created_at,
						id: last.id,
					}
	);
}
