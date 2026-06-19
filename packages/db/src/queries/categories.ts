import { sql } from "drizzle-orm";

import type { Category } from "../schema/categories";
import { coerceDates } from "../utils";
import type { AnyDb } from "./catalog-helpers";
import {
	arrayLiteral,
	CATEGORY_DATE_KEYS,
	STOREFRONT_STATUS_SQL,
} from "./catalog-helpers";

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

// ---------------------------------------------------------------------------
// getCategoryTree
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
// getCategoryBySlug
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
// getAllCategorySlugs
// ---------------------------------------------------------------------------

export async function getAllCategorySlugs(db: AnyDb): Promise<string[]> {
	const result = await db.execute<{ slug: string }>(sql`
		SELECT slug FROM category WHERE is_active = true
	`);
	return result.rows.map((r) => r.slug);
}
