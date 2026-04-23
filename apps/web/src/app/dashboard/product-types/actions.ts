"use server";

import { db } from "@emach/db";
import { productType, tool } from "@emach/db/schema/tools";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCurrentSession, requireRole } from "@/lib/session";
import {
	type ProductTypeFormValues,
	productTypeSchema,
	slugify,
} from "./_components/product-type-schema";

const PRODUCT_TYPES_PATH = "/dashboard/product-types";
const TOOLS_PATH = "/dashboard/tools";

export interface ProductTypeListItem {
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

export interface ProductTypeDetail {
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

function normalizePayload(input: ProductTypeFormValues) {
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

export async function listProductTypes(params?: {
	search?: string;
}): Promise<ProductTypeListItem[]> {
	await requireCurrentSession();

	const search = params?.search?.trim();
	const rows = await db
		.select({
			id: productType.id,
			name: productType.name,
			slug: productType.slug,
			description: productType.description,
			createdAt: productType.createdAt,
			toolsCount: sql<number>`count(${tool.id})::int`,
		})
		.from(productType)
		.leftJoin(tool, eq(tool.productTypeId, productType.id))
		.where(search ? ilike(productType.name, `%${search}%`) : undefined)
		.groupBy(
			productType.id,
			productType.name,
			productType.slug,
			productType.description,
			productType.createdAt
		)
		.orderBy(asc(productType.name));

	return rows.map((row) => ({
		...row,
		toolsCount: Number(row.toolsCount ?? 0),
	}));
}

export async function getProductType(
	id: string
): Promise<ProductTypeDetail | null> {
	await requireCurrentSession();

	const [row] = await db
		.select()
		.from(productType)
		.where(eq(productType.id, id))
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
		.where(eq(tool.productTypeId, id))
		.orderBy(asc(tool.name));

	return {
		...row,
		tools: linkedTools,
	};
}

export async function createProductType(
	input: ProductTypeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = productTypeSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(productType).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(PRODUCT_TYPES_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function updateProductType(
	id: string,
	input: ProductTypeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = productTypeSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	try {
		await db.update(productType).set(payload).where(eq(productType.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(PRODUCT_TYPES_PATH);
	revalidatePath(`${PRODUCT_TYPES_PATH}/${id}`);
	revalidatePath(`${PRODUCT_TYPES_PATH}/${id}/edit`);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function deleteProductType(id: string): Promise<ActionResult> {
	await requireRole("admin");

	const linkedTools = await db
		.select({ id: tool.id })
		.from(tool)
		.where(eq(tool.productTypeId, id))
		.limit(1);

	if (linkedTools.length > 0) {
		return {
			ok: false,
			error:
				"Não é possível remover um tipo com ferramentas vinculadas. Edite as ferramentas antes de remover.",
		};
	}

	try {
		await db.delete(productType).where(eq(productType.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(PRODUCT_TYPES_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: undefined };
}
