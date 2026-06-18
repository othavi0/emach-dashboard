"use server";

import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	type AttributeFormValues,
	attributeFormSchema,
	buildOptionsField,
} from "./attribute-schema";

function normalize(input: AttributeFormValues, categoryId: string) {
	return {
		slug: input.slug.trim(),
		label: input.label.trim(),
		inputType: input.inputType,
		unit: input.unit?.trim() ? input.unit.trim() : null,
		options: buildOptionsField(input),
		isRequired: input.isRequired,
		categoryId,
		sortOrder: input.sortOrder,
	};
}

export async function createCategoryAttribute(
	categoryId: string,
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("attributes.create");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	try {
		await db
			.insert(attributeDefinition)
			.values({ id, ...normalize(parsed.data, categoryId) });
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "attribute.created",
		targetId: id,
		targetType: "attribute",
		metadata: { label: parsed.data.label, slug: parsed.data.slug, categoryId },
	});
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: { id } };
}

export async function updateCategoryAttribute(
	id: string,
	categoryId: string,
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("attributes.update");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	try {
		await db
			.update(attributeDefinition)
			.set(normalize(parsed.data, categoryId))
			.where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "attribute.updated",
		targetId: id,
		targetType: "attribute",
		metadata: { label: parsed.data.label, categoryId },
	});
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: { id } };
}

export async function deleteCategoryAttribute(
	id: string,
	categoryId: string
): Promise<ActionResult> {
	const session = await requireCapability("attributes.delete");
	try {
		// Cascade na FK de toolAttributeValue lida com valores existentes.
		await db.delete(attributeDefinition).where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "attribute.deleted",
		targetId: id,
		targetType: "attribute",
		metadata: { categoryId },
	});
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: undefined };
}

export async function getAttributeUsage(id: string): Promise<number> {
	const rows = await db
		.select({ toolId: toolAttributeValue.toolId })
		.from(toolAttributeValue)
		.where(eq(toolAttributeValue.attributeId, id));
	return rows.length;
}
