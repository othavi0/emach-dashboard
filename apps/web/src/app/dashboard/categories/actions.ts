"use server";

import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	getCategoryChildrenPage as _getCategoryChildrenPage,
	getCategoryProductsPage as _getCategoryProductsPage,
	type CategoryChildItem,
	type CategoryProductItem,
	mapWriteError,
	revalidateCategoryTrees,
} from "./data";
import { type CategoryInput, categorySchema } from "./schema";

const CATEGORIES_PATH = "/dashboard/categories";

// ── Thin wrappers — called from "use client" components via useInfiniteList ──
// Guard here; implementation delegates to data.ts.

export async function getCategoryProductsPage(args: {
	categoryId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CategoryProductItem>> {
	await requireCapability("categories.read");
	return _getCategoryProductsPage(args);
}

export async function getCategoryChildrenPage(args: {
	categoryId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CategoryChildItem>> {
	await requireCapability("categories.read");
	return _getCategoryChildrenPage(args);
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createCategory(
	input: CategoryInput
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("categories.manage");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
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
		return { ok: false, error: actionErrorMessage(parsed.error) };
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
