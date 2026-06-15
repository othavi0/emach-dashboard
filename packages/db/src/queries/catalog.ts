import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
	AttributeDefinition,
	ToolAttributeValue,
} from "../schema/attributes";
import type { Category } from "../schema/categories";
import type { Promotion } from "../schema/promotions";
import type { Review } from "../schema/reviews";
import type { Tool, ToolImage, ToolVariant, Voltage } from "../schema/tools";

function coerceDates<T extends object>(obj: T, keys: readonly (keyof T)[]): T {
	for (const k of keys) {
		const v = obj[k];
		if (v !== null && v !== undefined && !(v instanceof Date)) {
			(obj as Record<keyof T, unknown>)[k] = new Date(v as string);
		}
	}
	return obj;
}

const TOOL_DATE_KEYS = ["createdAt", "updatedAt"] as const;
const VARIANT_DATE_KEYS = ["createdAt", "updatedAt"] as const;
const IMAGE_DATE_KEYS = ["createdAt"] as const;
const CATEGORY_DATE_KEYS = ["createdAt", "updatedAt"] as const;
const PROMOTION_DATE_KEYS = [
	"startsAt",
	"endsAt",
	"createdAt",
	"updatedAt",
] as const;
const REVIEW_DATE_KEYS = ["moderatedAt", "createdAt", "updatedAt"] as const;

type AnyDb = NodePgDatabase<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOREFRONT_TOOL_STATUSES = ["active", "discontinued"] as const;
const APPROVED = "approved" as const;
const DEFAULT_LIST_LIMIT = 24;
const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_PROMO_LIMIT = 4;
const TOOLS_PER_PROMO = 4;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ToolListItem {
	activePromotionId: string | null;
	avgRating: number | null;
	defaultVariant: {
		id: string;
		sku: string;
		voltage: Voltage | null;
		priceAmount: string;
		discountedAmount: string | null;
	};
	hasOtherVariants: boolean;
	id: string;
	inStock: boolean;
	name: string;
	primaryCategory: { id: string; slug: string; name: string } | null;
	primaryImage: { url: string } | null;
	reviewCount: number;
	slug: string;
	status: string;
}

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

export interface CategoryNode {
	children: CategoryNode[];
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	path: string;
	// Produtos visíveis na subárvore (categoria + descendentes), coerente com o
	// filtro de categoria de getTools (c.id = root.id OR c.path LIKE root.path || '%').
	productCount: number;
	slug: string;
	sortOrder: number;
}

export type CategoryDetail = Category & {
	ancestors: Category[];
};

export type PromotionWithTools = Promotion & {
	tools: ToolListItem[];
};

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

export type ReviewWithReviewer = Review & {
	clientName: string;
};

export interface ReviewStats {
	avg: number | null;
	count: number;
	distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatReviewerName(fullName: string): string {
	const trimmed = fullName.trim();
	if (trimmed === "") {
		return "Anônimo";
	}
	const parts = trimmed.split(REVIEWER_NAME_SPLIT_RE);
	if (parts.length === 1) {
		return parts[0] ?? trimmed;
	}
	const first = parts[0] ?? "";
	const last = parts.at(-1) ?? "";
	const initial = last.charAt(0).toUpperCase();
	return initial === "" ? first : `${first} ${initial}.`;
}

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

function toBoolean(value: unknown): boolean {
	return value === true || value === "t" || value === "true" || value === 1;
}

// Postgres ARRAY[$1, $2, ...]::T[] — interpolar array TS direto em
// drizzle-orm vira tupla `($1, $2)` que Postgres recusa em ANY()/= ANY().
function arrayLiteral<T>(values: T[], castType: string) {
	return sql`ARRAY[${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `
	)}]::${sql.raw(castType)}`;
}

const REVIEWER_NAME_SPLIT_RE = /\s+/;

// SQL fragments shared by getTools / getRecentTools / getActivePromotions
const STOREFRONT_STATUS_SQL = sql`t.status IN ('active','discontinued')`;

// ---------------------------------------------------------------------------
// 1. getTools
// ---------------------------------------------------------------------------

// biome-ignore lint/style/useConsistentTypeDefinitions: precisa satisfazer Record<string, unknown> de db.execute<T>
type ToolListRow = {
	active_promotion_id: string | null;
	avg_rating: string | null;
	cat_id: string | null;
	cat_name: string | null;
	cat_slug: string | null;
	discounted_amount: string | null;
	has_other_variants: boolean;
	id: string;
	in_stock: boolean;
	name: string;
	primary_image_url: string | null;
	review_count: number | string;
	slug: string;
	status: string;
	variant_id: string;
	variant_price: string;
	variant_sku: string;
	variant_voltage: Voltage | null;
};

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

function rowToToolListItem(row: ToolListRow): ToolListItem {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		status: row.status,
		primaryCategory:
			row.cat_id && row.cat_slug && row.cat_name
				? { id: row.cat_id, slug: row.cat_slug, name: row.cat_name }
				: null,
		defaultVariant: {
			id: row.variant_id,
			sku: row.variant_sku,
			voltage: row.variant_voltage,
			priceAmount: row.variant_price,
			discountedAmount: row.discounted_amount,
		},
		hasOtherVariants: toBoolean(row.has_other_variants),
		primaryImage: row.primary_image_url ? { url: row.primary_image_url } : null,
		inStock: toBoolean(row.in_stock),
		avgRating: toNullableNumber(row.avg_rating),
		reviewCount: Number(row.review_count) || 0,
		activePromotionId: row.active_promotion_id,
	};
}

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

	const countSql = sql`
		SELECT COUNT(DISTINCT t.id)::int AS total
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
	]);

	const reviewStats = await getReviewStats(db, toolId);

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
// 3. getCategoryTree
// ---------------------------------------------------------------------------

export async function getCategoryTree(db: AnyDb): Promise<CategoryNode[]> {
	const [result, countResult] = await Promise.all([
		db.execute<{
			id: string;
			slug: string;
			name: string;
			parent_id: string | null;
			path: string;
			depth: number;
			sort_order: number;
			is_active: boolean;
		}>(sql`
			SELECT id, slug, name, parent_id, path, depth, sort_order, is_active
			FROM category
			WHERE is_active = true
			ORDER BY depth ASC, sort_order ASC, name ASC
		`),
		// Contagem por subárvore: para cada categoria root, conta tools visíveis
		// distintos ligados à própria categoria OU a qualquer descendente.
		// Mesma semântica de visibilidade/escopo que buildToolListWhere de getTools.
		db.execute<{ category_id: string; product_count: number | string }>(sql`
			SELECT root.id AS category_id,
			       COUNT(DISTINCT t.id) AS product_count
			FROM category root
			JOIN category c
			  ON (c.id = root.id OR c.path LIKE root.path || '%')
			JOIN tool_category tc ON tc.category_id = c.id
			JOIN tool t
			  ON t.id = tc.tool_id
			 AND t.visible_on_site = true
			 AND ${STOREFRONT_STATUS_SQL}
			JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
			WHERE root.is_active = true
			GROUP BY root.id
		`),
	]);

	const countById = new Map<string, number>();
	for (const row of countResult.rows) {
		countById.set(row.category_id, Number(row.product_count) || 0);
	}

	const byId = new Map<string, CategoryNode>();
	for (const row of result.rows) {
		byId.set(row.id, {
			id: row.id,
			slug: row.slug,
			name: row.name,
			parentId: row.parent_id,
			path: row.path,
			depth: row.depth,
			sortOrder: row.sort_order,
			isActive: row.is_active,
			productCount: countById.get(row.id) ?? 0,
			children: [],
		});
	}

	const roots: CategoryNode[] = [];
	for (const node of byId.values()) {
		if (node.parentId === null) {
			roots.push(node);
			continue;
		}
		const parent = byId.get(node.parentId);
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	return roots;
}

// ---------------------------------------------------------------------------
// 4. getCategoryBySlug
// ---------------------------------------------------------------------------

export async function getCategoryBySlug(
	db: AnyDb,
	slug: string
): Promise<CategoryDetail | null> {
	const found = await db.execute<Category>(sql`
		SELECT id, slug, name, parent_id AS "parentId", sort_order AS "sortOrder",
		       is_active AS "isActive", description,
		       path, depth, created_at AS "createdAt", updated_at AS "updatedAt"
		FROM category
		WHERE slug = ${slug} AND is_active = true
		LIMIT 1
	`);

	const cat = found.rows[0];
	if (!cat) {
		return null;
	}
	coerceDates(cat, CATEGORY_DATE_KEYS);

	const ancestorIds = cat.path
		.split("/")
		.filter((part) => part !== "" && part !== cat.id);

	let ancestors: Category[] = [];
	if (ancestorIds.length > 0) {
		const ancestorsRes = await db.execute<Category>(sql`
			SELECT id, slug, name, parent_id AS "parentId", sort_order AS "sortOrder",
			       is_active AS "isActive", description,
			       path, depth, created_at AS "createdAt", updated_at AS "updatedAt"
			FROM category
			WHERE id = ANY(${arrayLiteral(ancestorIds, "text[]")})
			ORDER BY depth ASC
		`);
		ancestors = ancestorsRes.rows.map((a) =>
			coerceDates(a, CATEGORY_DATE_KEYS)
		);
	}

	return { ...cat, ancestors };
}

// ---------------------------------------------------------------------------
// 5. getActivePromotions
// ---------------------------------------------------------------------------

export async function getActivePromotions(
	db: AnyDb,
	limit: number = DEFAULT_PROMO_LIMIT
): Promise<PromotionWithTools[]> {
	const promosRes = await db.execute<Promotion>(sql`
		SELECT id, title, description, type, code,
		       discount_type AS "discountType",
		       discount_value AS "discountValue",
		       applies_to_all AS "appliesToAll",
		       max_redemptions AS "maxRedemptions",
		       redemption_count AS "redemptionCount",
		       min_order_amount AS "minOrderAmount",
		       active,
		       starts_at AS "startsAt",
		       ends_at AS "endsAt",
		       created_at AS "createdAt",
		       updated_at AS "updatedAt"
		FROM promotion
		WHERE type = 'promotion'
		  AND active = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at IS NULL OR ends_at > now())
		ORDER BY created_at DESC
		LIMIT ${limit}
	`);

	const result: PromotionWithTools[] = [];
	for (const promo of promosRes.rows) {
		coerceDates(promo, PROMOTION_DATE_KEYS);

		// Escopo das tools: applies_to_all → todas as visíveis; senão, as vinculadas
		// em promotion_tool (vazio = promoção inerte → tools:[]).
		let toolScope = sql`true`;
		if (!promo.appliesToAll) {
			const toolIdsRes = await db.execute<{ tool_id: string }>(sql`
				SELECT tool_id FROM promotion_tool WHERE promotion_id = ${promo.id}
			`);
			const toolIds = toolIdsRes.rows.map((r) => r.tool_id);
			if (toolIds.length === 0) {
				result.push({ ...promo, tools: [] });
				continue;
			}
			toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
		}

		const toolsRes = await db.execute<ToolListRow>(sql`
			SELECT
				t.id, t.slug, t.name, t.status,
				dv.id AS variant_id,
				dv.sku AS variant_sku,
				dv.voltage AS variant_voltage,
				dv.price_amount::text AS variant_price,
				CASE
					WHEN ${promo.discountType}::text = 'fixed'
						THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
					ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
				END AS discounted_amount,
				${promo.id}::text AS active_promotion_id,
				(SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
				(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
				COALESCE((
					SELECT SUM(sl.quantity) > 0
					FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id
				), false) AS in_stock,
				(SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
				(SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
				pc.id AS cat_id,
				pc.slug AS cat_slug,
				pc.name AS cat_name
			FROM tool t
			INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
			LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
			LEFT JOIN category pc ON pc.id = tc.category_id
			WHERE ${toolScope}
			  AND t.visible_on_site = true
			  AND ${STOREFRONT_STATUS_SQL}
			ORDER BY t.created_at DESC
			LIMIT ${TOOLS_PER_PROMO}
		`);

		result.push({
			...promo,
			tools: toolsRes.rows.map(rowToToolListItem),
		});
	}

	return result;
}

// ---------------------------------------------------------------------------
// 5b. getFeaturedPromotion — a promoção destacada no home (≤1), ativa e vigente
// ---------------------------------------------------------------------------

export async function getFeaturedPromotion(
	db: AnyDb
): Promise<PromotionWithTools | null> {
	const promosRes = await db.execute<Promotion>(sql`
		SELECT id, title, description, type, code,
		       discount_type AS "discountType",
		       discount_value AS "discountValue",
		       applies_to_all AS "appliesToAll",
		       max_redemptions AS "maxRedemptions",
		       redemption_count AS "redemptionCount",
		       min_order_amount AS "minOrderAmount",
		       active, featured,
		       starts_at AS "startsAt",
		       ends_at AS "endsAt",
		       created_at AS "createdAt",
		       updated_at AS "updatedAt"
		FROM promotion
		WHERE featured = true
		  AND type = 'promotion'
		  AND active = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at IS NULL OR ends_at > now())
		ORDER BY ends_at ASC NULLS LAST
		LIMIT 1
	`);

	const promo = promosRes.rows[0];
	if (!promo) {
		return null;
	}
	coerceDates(promo, PROMOTION_DATE_KEYS);

	let toolScope = sql`true`;
	if (!promo.appliesToAll) {
		const toolIdsRes = await db.execute<{ tool_id: string }>(sql`
			SELECT tool_id FROM promotion_tool WHERE promotion_id = ${promo.id}
		`);
		const toolIds = toolIdsRes.rows.map((r) => r.tool_id);
		if (toolIds.length === 0) {
			return null;
		}
		toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
	}

	const toolsRes = await db.execute<ToolListRow>(sql`
		SELECT
			t.id, t.slug, t.name, t.status,
			dv.id AS variant_id,
			dv.sku AS variant_sku,
			dv.voltage AS variant_voltage,
			dv.price_amount::text AS variant_price,
			CASE
				WHEN ${promo.discountType}::text = 'fixed'
					THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
				ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
			END AS discounted_amount,
			${promo.id}::text AS active_promotion_id,
			(SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
			(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
			COALESCE((
				SELECT SUM(sl.quantity) > 0
				FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id
			), false) AS in_stock,
			(SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
			(SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
			pc.id AS cat_id,
			pc.slug AS cat_slug,
			pc.name AS cat_name
		FROM tool t
		INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
		LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
		LEFT JOIN category pc ON pc.id = tc.category_id
		WHERE ${toolScope}
		  AND t.visible_on_site = true
		  AND ${STOREFRONT_STATUS_SQL}
		ORDER BY t.created_at DESC
		LIMIT ${TOOLS_PER_PROMO}
	`);

	const tools = toolsRes.rows.map(rowToToolListItem);
	if (tools.length === 0) {
		return null;
	}

	return { ...promo, tools };
}

// ---------------------------------------------------------------------------
// 6. getRecentTools
// ---------------------------------------------------------------------------

export async function getRecentTools(
	db: AnyDb,
	limit: number
): Promise<ToolListItem[]> {
	const { tools } = await getTools(db, { sort: "newest", limit, offset: 0 });
	return tools;
}

// ---------------------------------------------------------------------------
// 7. searchTools
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
// 8. getReviews
// ---------------------------------------------------------------------------

export interface GetReviewsInput {
	limit?: number;
	page: number;
	sort: "newest" | "rating-desc";
	toolId: string;
}

export async function getReviews(
	db: AnyDb,
	input: GetReviewsInput
): Promise<{ reviews: ReviewWithReviewer[]; total: number }> {
	const limit = input.limit ?? 10;
	const offset = (Math.max(1, input.page) - 1) * limit;
	const order =
		input.sort === "rating-desc"
			? sql`r.rating DESC, r.created_at DESC`
			: sql`r.created_at DESC`;

	const [listRes, countRes] = await Promise.all([
		db.execute<Review & { client_name: string }>(sql`
			SELECT
				r.id, r.tool_id AS "toolId", r.client_id AS "clientId",
				r.order_id AS "orderId", r.rating, r.title, r.body, r.status,
				r.moderated_by AS "moderatedBy", r.moderated_at AS "moderatedAt",
				r.moderation_note AS "moderationNote",
				r.created_at AS "createdAt", r.updated_at AS "updatedAt",
				c.name AS client_name
			FROM review r
			INNER JOIN client c ON c.id = r.client_id
			WHERE r.tool_id = ${input.toolId} AND r.status = ${APPROVED}
			ORDER BY ${order}
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ total: number | string }>(sql`
			SELECT COUNT(*)::int AS total
			FROM review r
			WHERE r.tool_id = ${input.toolId} AND r.status = ${APPROVED}
		`),
	]);

	const reviews: ReviewWithReviewer[] = listRes.rows.map((row) => {
		const { client_name, ...rest } = row;
		const review = coerceDates(rest as Review, REVIEW_DATE_KEYS);
		return {
			...review,
			clientName: formatReviewerName(client_name),
		};
	});

	return { reviews, total: Number(countRes.rows[0]?.total ?? 0) };
}

// ---------------------------------------------------------------------------
// 9. getReviewStats
// ---------------------------------------------------------------------------

export async function getReviewStats(
	db: AnyDb,
	toolId: string
): Promise<ReviewStats> {
	const result = await db.execute<{
		avg_rating: string | null;
		review_count: number | string;
		c1: number | string;
		c2: number | string;
		c3: number | string;
		c4: number | string;
		c5: number | string;
	}>(sql`
		SELECT
			AVG(rating)::numeric(3,2)::text AS avg_rating,
			COUNT(*)::int AS review_count,
			COUNT(*) FILTER (WHERE rating = 1)::int AS c1,
			COUNT(*) FILTER (WHERE rating = 2)::int AS c2,
			COUNT(*) FILTER (WHERE rating = 3)::int AS c3,
			COUNT(*) FILTER (WHERE rating = 4)::int AS c4,
			COUNT(*) FILTER (WHERE rating = 5)::int AS c5
		FROM review
		WHERE tool_id = ${toolId} AND status = ${APPROVED}
	`);

	const row = result.rows[0];
	const count = Number(row?.review_count ?? 0);

	return {
		avg: count > 0 ? toNullableNumber(row?.avg_rating) : null,
		count,
		distribution: {
			1: Number(row?.c1 ?? 0),
			2: Number(row?.c2 ?? 0),
			3: Number(row?.c3 ?? 0),
			4: Number(row?.c4 ?? 0),
			5: Number(row?.c5 ?? 0),
		},
	};
}

// ---------------------------------------------------------------------------
// 10. getAllToolSlugs / getAllCategorySlugs
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

export async function getAllCategorySlugs(db: AnyDb): Promise<string[]> {
	const result = await db.execute<{ slug: string }>(sql`
		SELECT slug FROM category WHERE is_active = true
	`);
	return result.rows.map((r) => r.slug);
}

// re-export tipos auxiliares úteis ao consumidor
export { STOREFRONT_TOOL_STATUSES };
