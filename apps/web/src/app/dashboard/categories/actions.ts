"use server";

import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type CategoryInput, categorySchema } from "./schema";

const CATEGORIES_PATH = "/dashboard/categories";

export type CategoryListItem = typeof category.$inferSelect;

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

function mapWriteError(e: unknown): string {
	if (e instanceof Error && e.message.includes("category cycle")) {
		return "Operação criaria um ciclo na árvore";
	}
	if (
		e instanceof Error &&
		e.message.includes("unique") &&
		e.message.includes("slug")
	) {
		return "Slug já está em uso";
	}
	return zodErrorMessage(e);
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
	};
}

export interface CategoryProduct {
	id: string;
	name: string;
	sku: string | null;
}

export async function getCategoryProducts(
	id: string,
	limit = 8
): Promise<CategoryProduct[]> {
	const rows = await db
		.select({
			id: tool.id,
			name: tool.name,
			sku: toolVariant.sku,
		})
		.from(toolCategory)
		.innerJoin(tool, eq(tool.id, toolCategory.toolId))
		.leftJoin(
			toolVariant,
			and(eq(toolVariant.toolId, tool.id), eq(toolVariant.isDefault, true))
		)
		.where(
			and(eq(toolCategory.categoryId, id), eq(toolCategory.isPrimary, true))
		)
		.orderBy(asc(tool.name))
		.limit(limit);
	return rows;
}

export async function createCategory(
	input: CategoryInput
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("categories.manage");

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

	revalidateCategoryTrees();
	return { ok: true, data: { id } };
}

export async function updateCategory(
	id: string,
	input: CategoryInput
): Promise<ActionResult> {
	await requireCapability("categories.manage");

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

	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	revalidatePath(`${CATEGORIES_PATH}/${id}/edit`);
	return { ok: true, data: undefined };
}

export async function toggleCategoryActive(
	id: string,
	isActive: boolean
): Promise<ActionResult> {
	await requireCapability("categories.manage");

	try {
		await db.update(category).set({ isActive }).where(eq(category.id, id));
	} catch (e) {
		logger.error("toggleCategoryActive", e);
		return { ok: false, error: "Não foi possível atualizar o status" };
	}

	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	return { ok: true, data: undefined };
}

const reorderSchema = z.object({
	parentId: z.string().nullable(),
	orderedIds: z.array(z.string().min(1)).min(1),
});

export async function reorderCategories(input: unknown): Promise<ActionResult> {
	await requireCapability("categories.manage");

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

	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
	await requireCapability("categories.manage");

	try {
		await db.delete(category).where(eq(category.id, id));
	} catch (e) {
		if (e instanceof Error && e.message.includes("foreign key")) {
			return {
				ok: false,
				error: "Categoria possui filhos ou produtos vinculados",
			};
		}
		return { ok: false, error: zodErrorMessage(e) };
	}

	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}
