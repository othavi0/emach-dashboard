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

export async function createTool(input: ToolFormValues): Promise<string> {
	await requireRole("admin");
	const parsed = toolFormSchema.parse(input);
	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed);
	const slug = slugify(parsed.name);

	await db.transaction(async (tx) => {
		await tx.insert(tool).values({ id, slug, ...payload });

		if (parsed.images.length > 0) {
			await tx.insert(toolImage).values(
				parsed.images.map((img, idx) => ({
					id: crypto.randomUUID(),
					toolId: id,
					url: img.url,
					sortOrder: idx,
				}))
			);
		}
	});

	revalidatePath(TOOLS_PATH);
	return id;
}

export async function updateTool(
	id: string,
	input: ToolFormValues
): Promise<void> {
	await requireRole("admin");
	const parsed = toolFormSchema.parse(input);
	const payload = normalizePayload(parsed);

	let toDelete: { id: string; url: string }[] = [];

	await db.transaction(async (tx) => {
		await tx.update(tool).set(payload).where(eq(tool.id, id));

		const existing = await tx
			.select({ id: toolImage.id, url: toolImage.url })
			.from(toolImage)
			.where(eq(toolImage.toolId, id));

		const incomingIds = new Set(
			parsed.images.map((img) => img.id).filter(Boolean) as string[]
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

		for (let i = 0; i < parsed.images.length; i++) {
			const img = parsed.images[i];
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

	if (toDelete.length > 0) {
		await Promise.allSettled(
			toDelete.map((row) => deleteToolImage(row.url))
		);
	}

	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
}

export async function deleteTool(id: string): Promise<void> {
	await requireRole("admin");

	const urls = await db
		.select({ url: toolImage.url })
		.from(toolImage)
		.where(eq(toolImage.toolId, id));

	await db.delete(tool).where(eq(tool.id, id));

	if (urls.length > 0) {
		await Promise.allSettled(urls.map((row) => deleteToolImage(row.url)));
	}

	revalidatePath(TOOLS_PATH);
}
