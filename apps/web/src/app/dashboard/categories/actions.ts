"use server";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { decodeCursorAs } from "@/lib/cursor";
import { getPgError } from "@/lib/db-error";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type CategoryInput, categorySchema } from "./schema";

const CATEGORIES_PATH = "/dashboard/categories";

export type CategoryListItem = typeof category.$inferSelect;

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

function mapWriteError(e: unknown): string {
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

function revalidateCategoryTrees() {
	revalidatePath(CATEGORIES_PATH);
	revalidatePath("/dashboard/tools", "layout");
	revalidatePath("/dashboard/stock");
}

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

export interface CategoryTreeItem {
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	productCount: number;
	slug: string;
	sortOrder: number;
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

	const counts = await db
		.select({
			categoryId: toolCategory.categoryId,
			productCount: count(),
		})
		.from(toolCategory)
		.where(eq(toolCategory.isPrimary, true))
		.groupBy(toolCategory.categoryId);

	const countById = new Map(
		counts.map((c) => [c.categoryId, Number(c.productCount)])
	);

	return cats.map((c) => ({
		...c,
		productCount: countById.get(c.id) ?? 0,
	}));
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

// ============================================================================
// Detalhe — hierarquia, atributos e coleções paginadas (entity-detail pattern)
// ============================================================================

/** Cadeia de ancestrais da raiz até o pai imediato (para o breadcrumb). */
export async function getCategoryAncestors(
	id: string
): Promise<{ id: string; name: string }[]> {
	const [self] = await db
		.select({ parentId: category.parentId })
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	const chain: { id: string; name: string }[] = [];
	let cursor: string | null = self?.parentId ?? null;
	while (cursor) {
		const [row]: { id: string; name: string; parentId: string | null }[] =
			await db
				.select({
					id: category.id,
					name: category.name,
					parentId: category.parentId,
				})
				.from(category)
				.where(eq(category.id, cursor))
				.limit(1);
		if (!row) {
			break;
		}
		chain.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}
	return chain.reverse();
}

export interface CategoryAttributeView {
	def: AttributeDefinition;
	/** Nome da categoria-pai de onde o atributo é herdado; null se próprio. */
	ownerName: string | null;
}

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

export interface CategoryProductItem {
	id: string;
	imageUrl: string | null;
	name: string;
	sku: string | null;
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

export interface CategoryChildItem {
	id: string;
	name: string;
	productCount: number;
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

export async function createCategory(
	input: CategoryInput
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("categories.manage");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();

	try {
		await db.insert(category).values({
			id,
			slug: parsed.data.slug,
			name: parsed.data.name,
			parentId: parsed.data.parentId ?? null,
			description: parsed.data.description ?? null,
			isActive: parsed.data.isActive,
			path: `/${parsed.data.slug}`,
			depth: 0,
		});
	} catch (e) {
		return { ok: false, error: mapWriteError(e) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "category.created",
		targetId: id,
		targetType: "category",
		metadata: { name: parsed.data.name, slug: parsed.data.slug },
	});
	revalidateCategoryTrees();
	return { ok: true, data: { id } };
}

export async function updateCategory(
	id: string,
	input: CategoryInput
): Promise<ActionResult> {
	const session = await requireCapability("categories.manage");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	try {
		await db
			.update(category)
			.set({
				slug: parsed.data.slug,
				name: parsed.data.name,
				parentId: parsed.data.parentId ?? null,
				description: parsed.data.description ?? null,
				isActive: parsed.data.isActive,
			})
			.where(eq(category.id, id));
	} catch (e) {
		return { ok: false, error: mapWriteError(e) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "category.updated",
		targetId: id,
		targetType: "category",
		metadata: { name: parsed.data.name },
	});
	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	revalidatePath(`${CATEGORIES_PATH}/${id}/edit`);
	return { ok: true, data: undefined };
}

export async function toggleCategoryActive(
	id: string,
	isActive: boolean
): Promise<ActionResult> {
	const session = await requireCapability("categories.manage");

	try {
		await db.update(category).set({ isActive }).where(eq(category.id, id));
	} catch (e) {
		logger.error("toggleCategoryActive", e);
		return { ok: false, error: "Não foi possível atualizar o status" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "category.updated",
		targetId: id,
		targetType: "category",
		metadata: { isActive },
	});
	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	return { ok: true, data: undefined };
}

const reorderSchema = z.object({
	parentId: z.string().nullable(),
	orderedIds: z.array(z.string().min(1)).min(1),
});

export async function reorderCategories(input: unknown): Promise<ActionResult> {
	const session = await requireCapability("categories.manage");

	const parsed = reorderSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Entrada de reordenação inválida" };
	}

	try {
		await db.transaction(async (tx) => {
			for (const [index, categoryId] of parsed.data.orderedIds.entries()) {
				await tx
					.update(category)
					.set({ sortOrder: index })
					.where(eq(category.id, categoryId));
			}
		});
	} catch (e) {
		logger.error("reorderCategories", e);
		return { ok: false, error: "Não foi possível salvar a nova ordem" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "category.reordered",
		targetType: "category",
		metadata: {
			parentId: parsed.data.parentId,
			count: parsed.data.orderedIds.length,
		},
	});
	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
	const session = await requireCapability("categories.delete");

	const [categoryRow] = await db
		.select({ name: category.name })
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	try {
		await db.delete(category).where(eq(category.id, id));
	} catch (e) {
		// foreign_key_violation: categoria com subcategorias, produtos ou atributos.
		if (getPgError(e)?.code === "23503") {
			return {
				ok: false,
				error:
					"Não é possível remover: a categoria tem subcategorias, produtos ou atributos vinculados. Remova-os antes.",
			};
		}
		logger.error("deleteCategory", e);
		return { ok: false, error: "Não foi possível remover a categoria" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "category.deleted",
		targetId: id,
		targetType: "category",
		metadata: { name: categoryRow?.name },
	});
	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}
