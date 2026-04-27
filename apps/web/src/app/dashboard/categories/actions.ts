"use server";

import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
			imageUrl:
				parsed.data.imageUrl === "" ? null : (parsed.data.imageUrl ?? null),
			isActive: parsed.data.isActive,
			sortOrder: parsed.data.sortOrder,
			path: `/${parsed.data.slug}`,
			depth: 0,
		});
	} catch (e) {
		if (e instanceof Error && e.message.includes("category cycle")) {
			return { ok: false, error: "Operação criaria um ciclo na árvore" };
		}
		if (
			e instanceof Error &&
			e.message.includes("unique") &&
			e.message.includes("slug")
		) {
			return { ok: false, error: "Slug já está em uso" };
		}
		return { ok: false, error: zodErrorMessage(e) };
	}

	revalidatePath(CATEGORIES_PATH);
	revalidatePath("/dashboard/tools", "layout");
	revalidatePath("/dashboard/stock");
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
				imageUrl:
					parsed.data.imageUrl === "" ? null : (parsed.data.imageUrl ?? null),
				isActive: parsed.data.isActive,
				sortOrder: parsed.data.sortOrder,
				path: `/${parsed.data.slug}`,
				depth: 0,
			})
			.where(eq(category.id, id));
	} catch (e) {
		if (e instanceof Error && e.message.includes("category cycle")) {
			return { ok: false, error: "Operação criaria um ciclo na árvore" };
		}
		if (
			e instanceof Error &&
			e.message.includes("unique") &&
			e.message.includes("slug")
		) {
			return { ok: false, error: "Slug já está em uso" };
		}
		return { ok: false, error: zodErrorMessage(e) };
	}

	revalidatePath(CATEGORIES_PATH);
	revalidatePath(`${CATEGORIES_PATH}/${id}/edit`);
	revalidatePath("/dashboard/tools", "layout");
	revalidatePath("/dashboard/stock");
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

	revalidatePath(CATEGORIES_PATH);
	revalidatePath("/dashboard/tools", "layout");
	return { ok: true, data: undefined };
}
