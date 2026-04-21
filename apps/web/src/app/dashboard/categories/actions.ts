"use server";

import { db } from "@emach/db";
import { category, tool } from "@emach/db/schema/tools";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCurrentSession, requireRole } from "@/lib/session";
import {
	type CategoryFormValues,
	categorySchema,
	slugify,
} from "./_components/category-schema";

const CATEGORIES_PATH = "/dashboard/categories";
const TOOLS_PATH = "/dashboard/tools";

export interface CategoryListItem {
	createdAt: Date;
	description: string | null;
	id: string;
	name: string;
	slug: string | null;
	toolsCount: number;
}

export interface LinkedTool {
	id: string;
	name: string;
	sku: string | null;
	visibleOnSite: boolean;
}

export interface CategoryDetail {
	createdAt: Date;
	description: string | null;
	id: string;
	name: string;
	slug: string | null;
	tools: LinkedTool[];
	updatedAt: Date;
}

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function normalizePayload(input: CategoryFormValues) {
	const description = input.description?.trim();

	return {
		name: input.name,
		slug: slugify(input.name),
		description: description ? description : null,
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

export async function listCategories(params?: {
	search?: string;
}): Promise<CategoryListItem[]> {
	await requireCurrentSession();

	const search = params?.search?.trim();
	const rows = await db
		.select({
			id: category.id,
			name: category.name,
			slug: category.slug,
			description: category.description,
			createdAt: category.createdAt,
			toolsCount: sql<number>`count(${tool.id})::int`,
		})
		.from(category)
		.leftJoin(tool, eq(tool.categoryId, category.id))
		.where(search ? ilike(category.name, `%${search}%`) : undefined)
		.groupBy(
			category.id,
			category.name,
			category.slug,
			category.description,
			category.createdAt
		)
		.orderBy(asc(category.name));

	return rows.map((row) => ({
		...row,
		toolsCount: Number(row.toolsCount ?? 0),
	}));
}

export async function getCategory(id: string): Promise<CategoryDetail | null> {
	await requireCurrentSession();

	const [row] = await db
		.select()
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	if (!row) {
		return null;
	}

	const linkedTools = await db
		.select({
			id: tool.id,
			name: tool.name,
			sku: tool.sku,
			visibleOnSite: tool.visibleOnSite,
		})
		.from(tool)
		.where(eq(tool.categoryId, id))
		.orderBy(asc(tool.name));

	return {
		...row,
		tools: linkedTools,
	};
}

export async function createCategory(
	input: CategoryFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(category).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(CATEGORIES_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function updateCategory(
	id: string,
	input: CategoryFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	try {
		await db.update(category).set(payload).where(eq(category.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(CATEGORIES_PATH);
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	revalidatePath(`${CATEGORIES_PATH}/${id}/edit`);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
	await requireRole("admin");

	const linkedTools = await db
		.select({ id: tool.id })
		.from(tool)
		.where(eq(tool.categoryId, id))
		.limit(1);

	if (linkedTools.length > 0) {
		return {
			ok: false,
			error:
				"Não é possível remover uma categoria com ferramentas vinculadas. Edite as ferramentas antes de remover.",
		};
	}

	try {
		await db.delete(category).where(eq(category.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(CATEGORIES_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: undefined };
}
