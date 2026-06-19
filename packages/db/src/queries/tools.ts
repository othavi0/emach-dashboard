import { sql } from "drizzle-orm";

import type {
	AttributeDefinition,
	ToolAttributeValue,
} from "../schema/attributes";
import type { Promotion } from "../schema/promotions";
import type { Tool, ToolImage, ToolVariant, Voltage } from "../schema/tools";
import { coerceDates } from "../utils";
import type { AnyDb, ToolListItem, ToolListRow } from "./catalog-helpers";
import {
	APPROVED,
	arrayLiteral,
	DEFAULT_LIST_LIMIT,
	DEFAULT_SEARCH_LIMIT,
	IMAGE_DATE_KEYS,
	PROMOTION_DATE_KEYS,
	rowToToolListItem,
	STOREFRONT_STATUS_SQL,
	TOOL_DATE_KEYS,
	toBoolean,
	VARIANT_DATE_KEYS,
} from "./catalog-helpers";
import type { ReviewStats } from "./reviews";
import { getReviewStats } from "./reviews";

export type { ToolListItem } from "./catalog-helpers";
// biome-ignore lint/performance/noBarrelFile: re-export de constante de contexto de ferramentas
export { STOREFRONT_TOOL_STATUSES } from "./catalog-helpers";

export interface GetToolsInput {
	categoryId?: string;
	excludeToolId?: string;
	limit?: number;
	offset?: number;
	onlyPromo?: boolean;
	priceMax?: number;
	priceMin?: number;
	search?: string;
	sort?: "relevance" | "price-asc" | "price-desc" | "name-asc" | "newest";
	voltage?: Voltage[];
}

export type ToolDetailVariant = ToolVariant;

export interface ToolDetail {
	activePromotion: Promotion | null;
	allCategories: Array<{
		id: string;
		slug: string;
		name: string;
		isPrimary: boolean;
	}>;
	attributes: Array<{
		definition: AttributeDefinition;
		value: ToolAttributeValue;
		sortOrder: number;
	}>;
	images: ToolImage[];
	primaryCategory: {
		id: string;
		slug: string;
		name: string;
		path: string;
	} | null;
	reviewStats: ReviewStats;
	stockByVariant: Record<string, boolean>;
	tool: Tool;
	variants: ToolDetailVariant[];
}

export interface ToolSearchResult {
	defaultVariant: {
		id: string;
		sku: string;
		voltage: Voltage | null;
		priceAmount: string;
	};
	id: string;
	name: string;
	primaryImage: { url: string } | null;
	slug: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildToolListWhere(input: GetToolsInput) {
	const filters = [STOREFRONT_STATUS_SQL, sql`t.visible_on_site = true`];

	if (input.excludeToolId) {
		filters.push(sql`t.id <> ${input.excludeToolId}`);
	}

	if (input.search && input.search.trim() !== "") {
		const term = `%${input.search.trim()}%`;
		filters.push(sql`(t.name ILIKE ${term} OR t.model ILIKE ${term})`);
	}

	if (input.categoryId) {
		filters.push(sql`EXISTS (
			SELECT 1
			FROM tool_category tc
			JOIN category c ON c.id = tc.category_id
			JOIN category root ON root.id = ${input.categoryId}
			WHERE tc.tool_id = t.id
			  AND (c.id = root.id OR c.path LIKE root.path || '%')
		)`);
	}

	if (input.voltage && input.voltage.length > 0) {
		filters.push(sql`EXISTS (
			SELECT 1 FROM tool_variant tvf
			WHERE tvf.tool_id = t.id AND tvf.voltage = ANY(${arrayLiteral(input.voltage, "voltage[]")})
		)`);
	}

	if (typeof input.priceMin === "number") {
		filters.push(
			sql`(SELECT MIN(price_amount) FROM tool_variant WHERE tool_id = t.id) >= ${input.priceMin}`
		);
	}

	if (typeof input.priceMax === "number") {
		filters.push(
			sql`(SELECT MIN(price_amount) FROM tool_variant WHERE tool_id = t.id) <= ${input.priceMax}`
		);
	}

	if (input.onlyPromo === true) {
		filters.push(sql`active_promo.id IS NOT NULL`);
	}

	return sql.join(filters, sql` AND `);
}

function buildToolListOrder(sortKey: GetToolsInput["sort"]) {
	switch (sortKey) {
		case "price-asc":
			return sql`dv.price_amount ASC, t.created_at DESC`;
		case "price-desc":
			return sql`dv.price_amount DESC, t.created_at DESC`;
		case "name-asc":
			return sql`t.name ASC`;
		default:
			return sql`t.created_at DESC`;
	}
}

// ---------------------------------------------------------------------------
// 1. getTools
// ---------------------------------------------------------------------------

export async function getTools(
	db: AnyDb,
	input: GetToolsInput
): Promise<{ tools: ToolListItem[]; total: number }> {
	const limit = input.limit ?? DEFAULT_LIST_LIMIT;
	const offset = input.offset ?? 0;
	const where = buildToolListWhere(input);
	const order = buildToolListOrder(input.sort);

	const listSql = sql`
		SELECT
			t.id, t.slug, t.name, t.status,
			dv.id   AS variant_id,
			dv.sku  AS variant_sku,
			dv.voltage AS variant_voltage,
			dv.price_amount::text AS variant_price,
			active_promo.final_price::text AS discounted_amount,
			active_promo.id AS active_promotion_id,
			(SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
			(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
			COALESCE((
				SELECT SUM(sl.quantity) > 0
				FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id
			), false) AS in_stock,
			rs.avg_rating::text AS avg_rating,
			COALESCE(rs.review_count, 0)::int AS review_count,
			pc.id AS cat_id,
			pc.slug AS cat_slug,
			pc.name AS cat_name
		FROM tool t
		INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
		LEFT JOIN LATERAL (
			SELECT p.id,
				CASE
					WHEN p.discount_type = 'fixed'
						THEN GREATEST(dv.price_amount - p.discount_value, 0)
					ELSE ROUND(dv.price_amount * (1 - p.discount_value / 100), 2)
				END AS final_price
			FROM promotion p
			WHERE p.type = 'promotion'
			  AND p.active = true
			  AND (p.starts_at IS NULL OR p.starts_at <= now())
			  AND (p.ends_at IS NULL OR p.ends_at > now())
			  AND (
			    p.applies_to_all = true
			    OR EXISTS (SELECT 1 FROM promotion_tool pt WHERE pt.promotion_id = p.id AND pt.tool_id = t.id)
			  )
			ORDER BY final_price ASC
			LIMIT 1
		) active_promo ON true
		LEFT JOIN LATERAL (
			SELECT AVG(r.rating)::numeric(3,2) AS avg_rating,
			       COUNT(*)::int AS review_count
			FROM review r
			WHERE r.tool_id = t.id AND r.status = ${APPROVED}
		) rs ON true
		LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
		LEFT JOIN category pc ON pc.id = tc.category_id
		WHERE ${where}
		ORDER BY ${order}
		LIMIT ${limit} OFFSET ${offset}
	`;

	const countPromoJoin =
		input.onlyPromo === true
			? sql` LEFT JOIN LATERAL (
			SELECT p.id,
				CASE
					WHEN p.discount_type = 'fixed'
						THEN GREATEST(dv.price_amount - p.discount_value, 0)
					ELSE ROUND(dv.price_amount * (1 - p.discount_value / 100), 2)
				END AS final_price
			FROM promotion p
			WHERE p.type = 'promotion'
			  AND p.active = true
			  AND (p.starts_at IS NULL OR p.starts_at <= now())
			  AND (p.ends_at IS NULL OR p.ends_at > now())
			  AND (
			    p.applies_to_all = true
			    OR EXISTS (SELECT 1 FROM promotion_tool pt WHERE pt.promotion_id = p.id AND pt.tool_id = t.id)
			  )
			ORDER BY final_price ASC
			LIMIT 1
		) active_promo ON true`
			: sql``;

	const countSql = sql`
		SELECT COUNT(DISTINCT t.id)::int AS total
		FROM tool t
		INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true${countPromoJoin}
		WHERE ${where}
	`;

	const [listResult, countResult] = await Promise.all([
		db.execute<ToolListRow>(listSql),
		db.execute<{ total: number | string }>(countSql),
	]);

	const tools = listResult.rows.map(rowToToolListItem);
	const total = Number(countResult.rows[0]?.total ?? 0);

	return { tools, total };
}

// ---------------------------------------------------------------------------
// 2. getToolBySlug
// ---------------------------------------------------------------------------

export async function getToolBySlug(
	db: AnyDb,
	slug: string
): Promise<ToolDetail | null> {
	const toolRows = await db.execute<Tool>(sql`
		SELECT t.id, t.name, t.slug, t.description, t.model,
		       t.invoice_model AS "invoiceModel",
		       t.status,
		       t.power_watts AS "powerWatts",
		       t.weight_kg AS "weightKg",
		       t.length_cm AS "lengthCm",
		       t.width_cm AS "widthCm",
		       t.height_cm AS "heightCm",
		       t.manufacturer_name AS "manufacturerName",
		       t.hs_code AS "hsCode",
		       t.ncm, t.cest,
		       t.visible_on_site AS "visibleOnSite",
		       t.video_url AS "videoUrl",
		       t.video_poster_url AS "videoPosterUrl",
		       t.created_at AS "createdAt",
		       t.updated_at AS "updatedAt"
		FROM tool t
		WHERE t.slug = ${slug}
		  AND t.visible_on_site = true
		  AND ${STOREFRONT_STATUS_SQL}
		LIMIT 1
	`);

	const toolRow = toolRows.rows[0];
	if (!toolRow) {
		return null;
	}
	coerceDates(toolRow, TOOL_DATE_KEYS);
	const toolId = toolRow.id;

	const [
		variantsResult,
		imagesResult,
		attributesResult,
		categoriesResult,
		activePromoResult,
		stockResult,
		reviewStats,
	] = await Promise.all([
		db.execute<ToolDetailVariant>(sql`
			SELECT id, tool_id AS "toolId", sku, voltage,
			       price_amount AS "priceAmount",
			       is_default AS "isDefault",
			       sort_order AS "sortOrder",
			       created_at AS "createdAt",
			       updated_at AS "updatedAt"
			FROM tool_variant
			WHERE tool_id = ${toolId}
			ORDER BY is_default DESC, sort_order ASC
		`),
		db.execute<ToolImage>(sql`
			SELECT id, tool_id AS "toolId", url, sort_order AS "sortOrder",
			       created_at AS "createdAt"
			FROM tool_image
			WHERE tool_id = ${toolId}
			ORDER BY sort_order ASC
		`),
		db.execute<{
			def_id: string;
			def_slug: string;
			def_label: string;
			def_input_type: AttributeDefinition["inputType"];
			def_unit: string | null;
			def_options: AttributeDefinition["options"];
			def_is_required: boolean;
			def_category_id: string;
			def_sort_order: number;
			def_created_at: Date;
			def_updated_at: Date;
			val_value_text: string | null;
			val_value_numeric: string | null;
			val_value_numeric_max: string | null;
			val_value_bool: boolean | null;
			val_created_at: Date;
			val_updated_at: Date;
			assignment_sort: number;
		}>(sql`
			SELECT
				ad.id AS def_id,
				ad.slug AS def_slug,
				ad.label AS def_label,
				ad.input_type AS def_input_type,
				ad.unit AS def_unit,
				ad.options AS def_options,
				ad.is_required AS def_is_required,
				ad.category_id AS def_category_id,
				ad.sort_order AS def_sort_order,
				ad.created_at AS def_created_at,
				ad.updated_at AS def_updated_at,
				v.value_text AS val_value_text,
				v.value_numeric AS val_value_numeric,
				v.value_numeric_max AS val_value_numeric_max,
				v.value_bool AS val_value_bool,
				v.created_at AS val_created_at,
				v.updated_at AS val_updated_at,
				taa.sort_order AS assignment_sort
			FROM tool_attribute_assignment taa
			INNER JOIN attribute_definition ad ON ad.id = taa.attribute_id
			INNER JOIN tool_attribute_value v ON v.tool_id = taa.tool_id AND v.attribute_id = taa.attribute_id
			WHERE taa.tool_id = ${toolId}
			ORDER BY taa.sort_order ASC
		`),
		db.execute<{
			id: string;
			slug: string;
			name: string;
			path: string;
			is_primary: boolean;
		}>(sql`
			SELECT c.id, c.slug, c.name, c.path, tc.is_primary
			FROM tool_category tc
			INNER JOIN category c ON c.id = tc.category_id
			WHERE tc.tool_id = ${toolId}
			ORDER BY tc.is_primary DESC, c.name ASC
		`),
		db.execute<Promotion>(sql`
			SELECT p.id, p.title, p.description, p.type, p.code,
			       p.discount_type AS "discountType",
			       p.discount_value AS "discountValue",
			       p.applies_to_all AS "appliesToAll",
			       p.max_redemptions AS "maxRedemptions",
			       p.redemption_count AS "redemptionCount",
			       p.min_order_amount AS "minOrderAmount",
			       p.active,
			       p.starts_at AS "startsAt",
			       p.ends_at AS "endsAt",
			       p.created_at AS "createdAt",
			       p.updated_at AS "updatedAt"
			FROM promotion p
			CROSS JOIN LATERAL (
				SELECT price_amount
				FROM tool_variant
				WHERE tool_id = ${toolId} AND is_default = true
				LIMIT 1
			) dv
			WHERE p.type = 'promotion'
			  AND p.active = true
			  AND (p.starts_at IS NULL OR p.starts_at <= now())
			  AND (p.ends_at IS NULL OR p.ends_at > now())
			  AND (
			    p.applies_to_all = true
			    OR EXISTS (SELECT 1 FROM promotion_tool pt WHERE pt.promotion_id = p.id AND pt.tool_id = ${toolId})
			  )
			ORDER BY
				CASE
					WHEN p.discount_type = 'fixed'
						THEN GREATEST(dv.price_amount - p.discount_value, 0)
					ELSE ROUND(dv.price_amount * (1 - p.discount_value / 100), 2)
				END ASC,
				p.created_at DESC
			LIMIT 1
		`),
		db.execute<{ variant_id: string; in_stock: boolean }>(sql`
			SELECT tv.id AS variant_id,
			       COALESCE(SUM(sl.quantity), 0) > 0 AS in_stock
			FROM tool_variant tv
			LEFT JOIN stock_level sl ON sl.variant_id = tv.id
			WHERE tv.tool_id = ${toolId}
			GROUP BY tv.id
		`),
		getReviewStats(db, toolId),
	]);

	const variants = variantsResult.rows.map((v) =>
		coerceDates(v, VARIANT_DATE_KEYS)
	);
	const images = imagesResult.rows.map((i) => coerceDates(i, IMAGE_DATE_KEYS));

	const attributes = attributesResult.rows.map((row) => ({
		definition: {
			id: row.def_id,
			slug: row.def_slug,
			label: row.def_label,
			inputType: row.def_input_type,
			unit: row.def_unit,
			options: row.def_options,
			isRequired: row.def_is_required,
			categoryId: row.def_category_id,
			sortOrder: row.def_sort_order,
			createdAt: new Date(row.def_created_at as unknown as string),
			updatedAt: new Date(row.def_updated_at as unknown as string),
		} satisfies AttributeDefinition,
		value: {
			toolId,
			attributeId: row.def_id,
			valueText: row.val_value_text,
			valueNumeric: row.val_value_numeric,
			valueNumericMax: row.val_value_numeric_max,
			valueBool: row.val_value_bool,
			createdAt: new Date(row.val_created_at as unknown as string),
			updatedAt: new Date(row.val_updated_at as unknown as string),
		} satisfies ToolAttributeValue,
		sortOrder: row.assignment_sort,
	}));

	const allCategories = categoriesResult.rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		isPrimary: row.is_primary,
	}));
	const primaryRow = categoriesResult.rows.find((r) => r.is_primary === true);
	const primaryCategory = primaryRow
		? {
				id: primaryRow.id,
				slug: primaryRow.slug,
				name: primaryRow.name,
				path: primaryRow.path,
			}
		: null;

	const stockByVariant: Record<string, boolean> = {};
	for (const row of stockResult.rows) {
		stockByVariant[row.variant_id] = toBoolean(row.in_stock);
	}

	return {
		tool: toolRow,
		variants,
		images,
		attributes,
		primaryCategory,
		allCategories,
		activePromotion: activePromoResult.rows[0]
			? coerceDates(activePromoResult.rows[0], PROMOTION_DATE_KEYS)
			: null,
		stockByVariant,
		reviewStats,
	};
}

// ---------------------------------------------------------------------------
// 3. getRecentTools
// ---------------------------------------------------------------------------

export async function getRecentTools(
	db: AnyDb,
	limit: number
): Promise<ToolListItem[]> {
	const { tools } = await getTools(db, { sort: "newest", limit, offset: 0 });
	return tools;
}

// ---------------------------------------------------------------------------
// 4. searchTools
// ---------------------------------------------------------------------------

export async function searchTools(
	db: AnyDb,
	q: string,
	limit: number = DEFAULT_SEARCH_LIMIT
): Promise<ToolSearchResult[]> {
	const trimmed = q.trim();
	if (trimmed.length < 2) {
		return [];
	}
	const term = `%${trimmed}%`;

	const result = await db.execute<{
		id: string;
		slug: string;
		name: string;
		variant_id: string;
		variant_sku: string;
		variant_voltage: Voltage | null;
		variant_price: string;
		primary_image_url: string | null;
	}>(sql`
		SELECT
			t.id, t.slug, t.name,
			dv.id AS variant_id,
			dv.sku AS variant_sku,
			dv.voltage AS variant_voltage,
			dv.price_amount::text AS variant_price,
			(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url
		FROM tool t
		INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
		WHERE ${STOREFRONT_STATUS_SQL}
		  AND t.visible_on_site = true
		  AND (t.name ILIKE ${term} OR t.model ILIKE ${term})
		ORDER BY t.created_at DESC
		LIMIT ${limit}
	`);

	return result.rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		defaultVariant: {
			id: row.variant_id,
			sku: row.variant_sku,
			voltage: row.variant_voltage,
			priceAmount: row.variant_price,
		},
		primaryImage: row.primary_image_url ? { url: row.primary_image_url } : null,
	}));
}

// ---------------------------------------------------------------------------
// 5. getAllToolSlugs
// ---------------------------------------------------------------------------

export async function getAllToolSlugs(db: AnyDb): Promise<string[]> {
	const result = await db.execute<{ slug: string | null }>(sql`
		SELECT slug FROM tool t
		WHERE ${STOREFRONT_STATUS_SQL}
		  AND t.visible_on_site = true
		  AND slug IS NOT NULL
	`);
	return result.rows
		.map((r) => r.slug)
		.filter((s): s is string => s !== null && s !== "");
}
