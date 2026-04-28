"use server";

import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/permissions";
import {
	type AttributeFormValues,
	attributeFormSchema,
	buildOptionsField,
} from "./schema";

const ATTRS_PATH = "/dashboard/attributes";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

function normalize(input: AttributeFormValues) {
	return {
		slug: input.slug.trim(),
		label: input.label.trim(),
		inputType: input.inputType,
		unit: input.unit?.trim() ? input.unit.trim() : null,
		options: buildOptionsField(input),
		isRequired: input.isRequired,
		categoryId: input.categoryId?.trim() ? input.categoryId : null,
		sortOrder: input.sortOrder,
	};
}

export async function createAttribute(
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("attributes.create");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	try {
		await db
			.insert(attributeDefinition)
			.values({ id, ...normalize(parsed.data) });
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(ATTRS_PATH);
	return { ok: true, data: { id } };
}

export async function updateAttribute(
	id: string,
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("attributes.update");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	try {
		await db
			.update(attributeDefinition)
			.set(normalize(parsed.data))
			.where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(ATTRS_PATH);
	revalidatePath(`${ATTRS_PATH}/${id}/edit`);
	return { ok: true, data: { id } };
}

export async function deleteAttribute(id: string): Promise<ActionResult> {
	await requireCapability("attributes.delete");
	try {
		// Cascade na FK de toolAttributeValue lida com valores existentes.
		await db.delete(attributeDefinition).where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(ATTRS_PATH);
	return { ok: true, data: undefined };
}

/**
 * Conta quantas ferramentas usam o atributo, para alertar antes de deletar.
 */
export async function getAttributeUsage(id: string): Promise<number> {
	const rows = await db
		.select({ toolId: toolAttributeValue.toolId })
		.from(toolAttributeValue)
		.where(eq(toolAttributeValue.attributeId, id));
	return rows.length;
}
