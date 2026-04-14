"use server";

import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/session";
import { type ToolFormValues, toolFormSchema } from "./_components/tool-schema";

const TOOLS_PATH = "/dashboard/tools";

function normalizePayload(input: ToolFormValues) {
	return {
		name: input.name,
		slug: input.slug,
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
		imageUrl: input.imageUrl?.trim() || null,
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

	await db.insert(tool).values({ id, ...payload });
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

	await db.update(tool).set(payload).where(eq(tool.id, id));
	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
}

export async function deleteTool(id: string): Promise<void> {
	await requireRole("admin");
	await db.delete(tool).where(eq(tool.id, id));
	revalidatePath(TOOLS_PATH);
}
