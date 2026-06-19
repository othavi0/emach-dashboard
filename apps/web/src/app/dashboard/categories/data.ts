import "server-only";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { decodeCursorAs } from "@/lib/cursor";
import { getPgError } from "@/lib/db-error";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { buildEffectiveAttributeCounts } from "./_lib/effective-attributes";

const CATEGORIES_PATH = "/dashboard/categories";

// ── Types ──────────────────────────────────────────────────────────────────

export type CategoryListItem = typeof category.$inferSelect;

export interface CategoryTreeItem {
	/** Atributos efetivos (próprios + herdados) — alimenta o gate de completude. */
	attributeCount: number;
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	productCount: number;
	slug: string;
	sortOrder: number;
}

export interface CategoryDetailData {
	category: CategoryListItem;
	children: { id: string; name: string; productCount: number }[];
	ownAttributeCount: number;
	parent: { id: string; name: string } | null;
	productCount: number;
	/** Produtos diretos + os de toda a subárvore de descendentes. */
	rollupProductCount: number;
}

export interface CategoryAttributeView {
	def: AttributeDefinition;
	/** Nome da categoria-pai de onde o atributo é herdado; null se próprio. */
	ownerName: string | null;
}

export interface CategoryProductItem {
	id: string;
	imageUrl: string | null;
	name: string;
	sku: string | null;
}

export interface CategoryChildItem {
	id: string;
	name: string;
	productCount: number;
}

// ── Private helpers (exported so actions.ts can import) ────────────────────

export function mapWriteError(e: unknown): string {
	const pg = getPgError(e);
	if (pg) {
		// Trigger anti-ciclo (prevent_category_cycle) levanta P0001.
		if (pg.code === "P0001" && pg.message.includes("category cycle")) {
			return "Operação criaria um ciclo na árvore";
		}
		// unique_violation no slug.
		if (
			pg.code === "23505" &&
			(pg.constraint?.includes("slug") || pg.message.includes("slug"))
		) {
			return "Slug já está em uso";
		}
	}
	logger.error("category write error", e);
	return "Não foi possível salvar a categoria";
}

export function revalidateCategoryTrees() {
	revalidatePath(CATEGORIES_PATH);
	revalidatePath("/dashboard/tools", "layout");
	revalidatePath("/dashboard/stock");
}

// ── Read functions ─────────────────────────────────────────────────────────
// None of these call requireCapability — they are NOT endpoints.
// Guards are enforced by callers (Server Component pages or action wrappers).

export async function listCategories(): Promise<CategoryListItem[]> {
	return await db.select().from(category).orderBy(asc(category.path));
}

export async function getCategory(
	id: string
): Promise<CategoryListItem | null> {
	const rows = await db
		.select()
		.from(category)
		.where(eq(category.id, id))
		.limit(1);
	return rows[0] ?? null;
}

export async function listCategoriesForTree(): Promise<CategoryTreeItem[]> {
	const cats = await db
		.select({
			id: category.id,
			name: category.name,
			slug: category.slug,
			parentId: category.parentId,
			depth: category.depth,
			sortOrder: category.sortOrder,
			isActive: category.isActive,
		})
		.from(category)
		.orderBy(asc(category.path));

	const [counts, attributeCounts] = await Promise.all([
		db
			.select({
				categoryId: toolCategory.categoryId,
				productCount: count(),
			})
			.from(toolCategory)
			.where(eq(toolCategory.isPrimary, true))
			.groupBy(toolCategory.categoryId),
		buildEffectiveAttributeCounts(),
	]);

	const countById = new Map(
		counts.map((c) => [c.categoryId, Number(c.productCount)])
	);

	return cats.map((c) => ({
		...c,
		productCount: countById.get(c.id) ?? 0,
		attributeCount: attributeCounts.get(c.id) ?? 0,
	}));
}

export async function getCategoryDetail(
	id: string
): Promise<CategoryDetailData | null> {
	const current = await getCategory(id);
	if (!current) {
		return null;
	}

	const [parentRow] = current.parentId
		? await db
				.select({ id: category.id, name: category.name })
				.from(category)
				.where(eq(category.id, current.parentId))
				.limit(1)
		: [];

	const childRows = await db
		.select({ id: category.id, name: category.name })
		.from(category)
		.where(eq(category.parentId, id))
		.orderBy(asc(category.sortOrder), asc(category.name));

	const childCounts = await db
		.select({ categoryId: toolCategory.categoryId, c: count() })
		.from(toolCategory)
		.where(
			and(
				eq(toolCategory.isPrimary, true),
				inArray(
					toolCategory.categoryId,
					childRows.length > 0 ? childRows.map((r) => r.id) : [""]
				)
			)
		)
		.groupBy(toolCategory.categoryId);
	const childCountById = new Map(
		childCounts.map((r) => [r.categoryId, Number(r.c)])
	);

	const [productCountRow] = await db
		.select({ value: count() })
		.from(toolCategory)
		.where(
			and(eq(toolCategory.categoryId, id), eq(toolCategory.isPrimary, true))
		);

	const [ownAttributeCountRow] = await db
		.select({ value: count() })
		.from(attributeDefinition)
		.where(eq(attributeDefinition.categoryId, id));

	// Rollup: produtos primários da subárvore (self + descendentes), via path
	// materializado. Paths são slugs (sem % ou _), seguro para LIKE.
	const [rollupRow] = await db
		.select({ value: count() })
		.from(toolCategory)
		.innerJoin(category, eq(category.id, toolCategory.categoryId))
		.where(
			and(
				eq(toolCategory.isPrimary, true),
				or(
					eq(category.path, current.path),
					like(category.path, `${current.path}/%`)
				)
			)
		);

	return {
		category: current,
		parent: parentRow ?? null,
		children: childRows.map((r) => ({
			id: r.id,
			name: r.name,
			productCount: childCountById.get(r.id) ?? 0,
		})),
		ownAttributeCount: Number(ownAttributeCountRow?.value ?? 0),
		productCount: Number(productCountRow?.value ?? 0),
		rollupProductCount: Number(rollupRow?.value ?? 0),
	};
}

/** Cadeia de ancestrais da raiz até o pai imediato (para o breadcrumb). */
export const getCategoryAncestors = cache(
	async (id: string): Promise<{ id: string; name: string }[]> => {
		const rows = await db.execute<{ id: string; name: string; depth: number }>(
			sql`
				WITH RECURSIVE ancestors AS (
					SELECT c.id, c.name, c.parent_id, c.depth
					FROM category c
					WHERE c.id = (SELECT parent_id FROM category WHERE id = ${id})
					UNION ALL
					SELECT c.id, c.name, c.parent_id, c.depth
					FROM category c
					JOIN ancestors a ON c.id = a.parent_id
				)
				SELECT id, name, depth
				FROM ancestors
				ORDER BY depth ASC
			`
		);
		return rows.rows.map((r) => ({ id: r.id, name: r.name }));
	}
);

/** Atributos próprios da categoria + herdados da cadeia ancestral. */
export async function getCategoryAttributes(
	categoryId: string
): Promise<CategoryAttributeView[]> {
	const ancestors = await getCategoryAncestors(categoryId);
	const nameById = new Map(ancestors.map((c) => [c.id, c.name]));

	const ids = [categoryId, ...ancestors.map((c) => c.id)];
	const defs = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.categoryId, ids));

	return defs
		.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
		.map((def) => ({
			def,
			ownerName:
				def.categoryId === categoryId
					? null
					: (nameById.get(def.categoryId) ?? "Origem"),
		}));
}

/**
 * Produtos primários de toda a subárvore da categoria (self + descendentes),
 * paginados por nome (keyset). Subárvore via path materializado — bate com o
 * rollup do KPI e com o número da listagem.
 */
export async function getCategoryProductsPage({
	categoryId,
	cursor,
}: {
	categoryId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CategoryProductItem>> {
	const [self] = await db
		.select({ path: category.path })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);
	if (!self) {
		return { items: [], nextCursor: null };
	}

	const decoded = cursor ? decodeCursorAs(cursor, "nameAsc") : null;

	const rows = await db
		.select({ id: tool.id, name: tool.name, sku: toolVariant.sku })
		.from(toolCategory)
		.innerJoin(tool, eq(tool.id, toolCategory.toolId))
		.innerJoin(category, eq(category.id, toolCategory.categoryId))
		.leftJoin(
			toolVariant,
			and(eq(toolVariant.toolId, tool.id), eq(toolVariant.isDefault, true))
		)
		.where(
			and(
				eq(toolCategory.isPrimary, true),
				or(eq(category.path, self.path), like(category.path, `${self.path}/%`)),
				decoded
					? sql`(${tool.name}, ${tool.id}) > (${decoded.name}, ${decoded.id})`
					: undefined
			)
		)
		.orderBy(asc(tool.name), asc(tool.id))
		.limit(BATCH_SIZE + 1);

	const page = paginate(
		rows,
		(r) => ({ id: r.id, name: r.name, sku: r.sku }),
		(last) => ({ v: 1, sort: "nameAsc", name: last.name, id: last.id })
	);

	// Thumb via enriquecimento em 2 passos (subquery escalar no select não
	// materializa — ver packages/db/CLAUDE.md). Primeira imagem por sortOrder.
	const ids = page.items.map((i) => i.id);
	const thumbByTool = new Map<string, string>();
	if (ids.length > 0) {
		const imgs = await db
			.select({
				toolId: toolImage.toolId,
				url: toolImage.url,
				sortOrder: toolImage.sortOrder,
			})
			.from(toolImage)
			.where(inArray(toolImage.toolId, ids))
			.orderBy(asc(toolImage.toolId), asc(toolImage.sortOrder));
		for (const img of imgs) {
			if (!thumbByTool.has(img.toolId)) {
				thumbByTool.set(img.toolId, img.url);
			}
		}
	}

	return {
		items: page.items.map((i) => ({
			...i,
			imageUrl: thumbByTool.get(i.id) ?? null,
		})),
		nextCursor: page.nextCursor,
	};
}

/** Subcategorias diretas, paginadas por ordem manual + id (keyset). */
export async function getCategoryChildrenPage({
	categoryId,
	cursor,
}: {
	categoryId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CategoryChildItem>> {
	const decoded = cursor ? decodeCursorAs(cursor, "categoryTree") : null;

	const rows = await db
		.select({
			id: category.id,
			name: category.name,
			sortOrder: category.sortOrder,
		})
		.from(category)
		.where(
			and(
				eq(category.parentId, categoryId),
				decoded
					? sql`(${category.sortOrder}, ${category.id}) > (${decoded.sortOrder}, ${decoded.id})`
					: undefined
			)
		)
		.orderBy(asc(category.sortOrder), asc(category.id))
		.limit(BATCH_SIZE + 1);

	const page = paginate(
		rows,
		(r) => ({ id: r.id, name: r.name }),
		(last) => ({
			v: 1,
			sort: "categoryTree",
			sortOrder: last.sortOrder,
			id: last.id,
		})
	);

	const ids = page.items.map((i) => i.id);
	const countById = new Map<string, number>();
	if (ids.length > 0) {
		const counts = await db
			.select({ categoryId: toolCategory.categoryId, c: count() })
			.from(toolCategory)
			.where(
				and(
					eq(toolCategory.isPrimary, true),
					inArray(toolCategory.categoryId, ids)
				)
			)
			.groupBy(toolCategory.categoryId);
		for (const r of counts) {
			countById.set(r.categoryId, Number(r.c));
		}
	}

	return {
		items: page.items.map((i) => ({
			...i,
			productCount: countById.get(i.id) ?? 0,
		})),
		nextCursor: page.nextCursor,
	};
}

export async function getAttributeUsage(id: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(toolAttributeValue)
		.where(eq(toolAttributeValue.attributeId, id));
	return Number(row?.value ?? 0);
}
