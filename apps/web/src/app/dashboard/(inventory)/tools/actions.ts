"use server";

import { db } from "@emach/db";
import { tool, toolImage } from "@emach/db/schema/tools";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/session";
import { deleteToolImage } from "./_components/image-actions";
import {
	slugify,
	type ToolFormValues,
	toolFormSchema,
} from "./_components/tool-schema";

const TOOLS_PATH = "/dashboard/tools";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

function normalizePayload(input: ToolFormValues) {
	return {
		name: input.name,
		description: input.description?.trim() || null,
		sku: input.sku,
		voltage: input.voltage ? input.voltage : null,
		price:
			typeof input.price === "number" && !Number.isNaN(input.price)
				? input.price.toFixed(2)
				: null,
		cost:
			typeof input.cost === "number" && !Number.isNaN(input.cost)
				? input.cost.toFixed(2)
				: null,
		visibleOnSite: input.visibleOnSite,
		categoryId: input.categoryId,
		supplierId: input.supplierId?.trim() || null,
	};
}

export async function createTool(
	input: ToolFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);
	const slug = slugify(parsed.data.name);

	try {
		await db.transaction(async (tx) => {
			await tx.insert(tool).values({ id, slug, ...payload });

			if (parsed.data.images.length > 0) {
				await tx.insert(toolImage).values(
					parsed.data.images.map((img, idx) => ({
						id: crypto.randomUUID(),
						toolId: id,
						url: img.url,
						sortOrder: idx,
					}))
				);
			}
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function updateTool(
	id: string,
	input: ToolFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const payload = normalizePayload(parsed.data);

	let toDelete: { id: string; url: string }[] = [];

	try {
		await db.transaction(async (tx) => {
			await tx.update(tool).set(payload).where(eq(tool.id, id));

			const existing = await tx
				.select({ id: toolImage.id, url: toolImage.url })
				.from(toolImage)
				.where(eq(toolImage.toolId, id));

			const incomingIds = new Set(
				parsed.data.images.map((img) => img.id).filter(Boolean) as string[]
			);
			toDelete = existing.filter((row) => !incomingIds.has(row.id));

			if (toDelete.length > 0) {
				await tx.delete(toolImage).where(
					and(
						eq(toolImage.toolId, id),
						inArray(
							toolImage.id,
							toDelete.map((row) => row.id)
						)
					)
				);
			}

			// Two-phase sortOrder update: set removed rows to negative sentinels
			// first to free up the unique(toolId, sortOrder) constraint, then
			// upsert each incoming image at its final index.
			const remaining = await tx
				.select({ id: toolImage.id })
				.from(toolImage)
				.where(eq(toolImage.toolId, id));

			if (remaining.length > 0) {
				for (let i = 0; i < remaining.length; i++) {
					await tx
						.update(toolImage)
						.set({ sortOrder: -(i + 1) })
						.where(eq(toolImage.id, remaining[i].id));
				}
			}

			for (let i = 0; i < parsed.data.images.length; i++) {
				const img = parsed.data.images[i];
				if (img.id) {
					await tx
						.update(toolImage)
						.set({ sortOrder: i, url: img.url })
						.where(eq(toolImage.id, img.id));
				} else {
					await tx.insert(toolImage).values({
						id: crypto.randomUUID(),
						toolId: id,
						url: img.url,
						sortOrder: i,
					});
				}
			}
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	if (toDelete.length > 0) {
		await Promise.allSettled(
			toDelete.map((row) => deleteToolImage(row.url))
		);
	}

	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: { id } };
}

export async function deleteTool(id: string): Promise<ActionResult> {
	await requireRole("admin");

	const urls = await db
		.select({ url: toolImage.url })
		.from(toolImage)
		.where(eq(toolImage.toolId, id));

	try {
		await db.delete(tool).where(eq(tool.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	if (urls.length > 0) {
		await Promise.allSettled(urls.map((row) => deleteToolImage(row.url)));
	}

	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: undefined };
}
