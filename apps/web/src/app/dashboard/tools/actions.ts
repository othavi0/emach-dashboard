"use server";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/permissions";
import { deleteToolImage } from "./_components/image-actions";
import {
	type AttributeValueInput,
	slugify,
	type ToolFormValues,
	type ToolVariantInput,
	toolFormSchema,
} from "./_components/tool-schema";

const TOOLS_PATH = "/dashboard/tools";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string }
	| { ok: false; warning: "orphan_attributes"; orphanLabels: string[] };

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

function toNumericString(value: number | null | undefined): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return value.toFixed(2);
}

function toWeightString(value: number | undefined): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return value.toFixed(3);
}

function toInt(value: number | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return Math.trunc(value);
}

function nullableText(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function normalizeToolPayload(input: ToolFormValues) {
	return {
		name: input.name,
		description: nullableText(input.description),
		model: nullableText(input.model),
		invoiceModel: nullableText(input.invoiceModel),
		manufacturerName: nullableText(input.manufacturerName),
		countryOfOrigin: nullableText(input.countryOfOrigin),
		status: input.status,
		hsCode: nullableText(input.hsCode),
		ncm: nullableText(input.ncm),
		cest: nullableText(input.cest),
		powerWatts: toInt(input.powerWatts),
		weightKg: toWeightString(input.weightKg),
		lengthCm: toNumericString(input.lengthCm),
		widthCm: toNumericString(input.widthCm),
		heightCm: toNumericString(input.heightCm),
		visibleOnSite: input.visibleOnSite,
		supplierId: nullableText(input.supplierId),
	};
}

function normalizeVariantValues(
	v: ToolVariantInput
): Omit<typeof toolVariant.$inferInsert, "id" | "toolId"> {
	return {
		sku: v.sku.trim(),
		barcode: nullableText(v.barcode),
		voltage: v.voltage ? v.voltage : null,
		priceAmount: v.priceAmount.toFixed(2),
		costAmount: toNumericString(v.costAmount ?? null),
		isDefault: v.isDefault,
		sortOrder: v.sortOrder,
	};
}

/**
 * Recursive ancestor walk on category, returning all attribute definitions
 * whose categoryId is null (global) or matches any ancestor of the given category.
 */
async function fetchActiveAttributeDefinitions(
	categoryId: string
): Promise<AttributeDefinition[]> {
	const rows = await db.execute(sql`
		WITH RECURSIVE chain AS (
			SELECT id, parent_id FROM category WHERE id = ${categoryId}
			UNION ALL
			SELECT c.id, c.parent_id FROM category c
			JOIN chain ON c.id = chain.parent_id
		)
		SELECT ad.* FROM attribute_definition ad
		WHERE ad.category_id IN (SELECT id FROM chain) OR ad.category_id IS NULL
		ORDER BY ad.sort_order, ad.label
	`);
	return rows.rows as unknown as AttributeDefinition[];
}

function attributeValueRow(
	def: AttributeDefinition,
	input: AttributeValueInput
): {
	valueText: string | null;
	valueNumeric: string | null;
	valueNumericMax: string | null;
	valueBool: boolean | null;
} | null {
	if (!input) {
		return null;
	}
	const num = (n: number | null | undefined) =>
		typeof n === "number" && !Number.isNaN(n) ? n.toString() : null;
	switch (def.inputType) {
		case "text":
			return input.valueText?.trim()
				? {
						valueText: input.valueText.trim(),
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "number":
			return typeof input.valueNumeric === "number" &&
				!Number.isNaN(input.valueNumeric)
				? {
						valueText: null,
						valueNumeric: num(input.valueNumeric),
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "boolean":
			return typeof input.valueBool === "boolean"
				? {
						valueText: null,
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: input.valueBool,
					}
				: null;
		case "select":
		case "color":
			return input.valueText?.trim()
				? {
						valueText: input.valueText.trim(),
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "numeric_range":
			return typeof input.valueNumeric === "number" &&
				!Number.isNaN(input.valueNumeric)
				? {
						valueText: null,
						valueNumeric: num(input.valueNumeric),
						valueNumericMax: num(input.valueNumericMax ?? null),
						valueBool: null,
					}
				: null;
		default:
			return null;
	}
}

export async function createTool(
	input: ToolFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("tools.create");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	const payload = normalizeToolPayload(parsed.data);
	const slug = slugify(parsed.data.name);

	const definitions = await fetchActiveAttributeDefinitions(
		parsed.data.primaryCategoryId
	);
	const definitionsBySlug = new Map(definitions.map((d) => [d.slug, d]));

	try {
		await db.transaction(async (tx) => {
			await tx.insert(tool).values({ id, slug, ...payload });

			await tx.insert(toolVariant).values(
				parsed.data.variants.map((v) => ({
					id: crypto.randomUUID(),
					toolId: id,
					...normalizeVariantValues(v),
				}))
			);

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

			await tx.insert(toolCategory).values(
				parsed.data.categoryIds.map((catId) => ({
					toolId: id,
					categoryId: catId,
					isPrimary: catId === parsed.data.primaryCategoryId,
				}))
			);

			const attributeRows: (typeof toolAttributeValue.$inferInsert)[] = [];
			for (const [slug, value] of Object.entries(parsed.data.attributeValues)) {
				const def = definitionsBySlug.get(slug);
				if (!def) {
					continue;
				}
				const row = attributeValueRow(def, value);
				if (!row) {
					continue;
				}
				attributeRows.push({ toolId: id, attributeId: def.id, ...row });
			}
			if (attributeRows.length > 0) {
				await tx.insert(toolAttributeValue).values(attributeRows);
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
	input: ToolFormValues,
	options: { confirmOrphans?: boolean } = {}
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("tools.update");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const payload = normalizeToolPayload(parsed.data);

	const definitions = await fetchActiveAttributeDefinitions(
		parsed.data.primaryCategoryId
	);
	const activeDefIds = new Set(definitions.map((d) => d.id));
	const definitionsBySlug = new Map(definitions.map((d) => [d.slug, d]));

	const existingValues = await db
		.select({
			attributeId: toolAttributeValue.attributeId,
			label: attributeDefinition.label,
		})
		.from(toolAttributeValue)
		.innerJoin(
			attributeDefinition,
			eq(attributeDefinition.id, toolAttributeValue.attributeId)
		)
		.where(eq(toolAttributeValue.toolId, id));

	const orphans = existingValues.filter(
		(v) => !activeDefIds.has(v.attributeId)
	);
	if (orphans.length > 0 && !options.confirmOrphans) {
		return {
			ok: false,
			warning: "orphan_attributes",
			orphanLabels: orphans.map((o) => o.label),
		};
	}

	let toDelete: { id: string; url: string }[] = [];

	try {
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transação coeso atualizando 4 entidades (tool, variants, images, categories, attribute_values) com sincronização order-aware
		await db.transaction(async (tx) => {
			await tx.update(tool).set(payload).where(eq(tool.id, id));

			// --- Variantes ---
			const existingVariants = await tx
				.select({ id: toolVariant.id })
				.from(toolVariant)
				.where(eq(toolVariant.toolId, id));
			const incomingVariantIds = new Set(
				parsed.data.variants.map((v) => v.id).filter(Boolean) as string[]
			);
			const variantsToDelete = existingVariants
				.map((r) => r.id)
				.filter((vid) => !incomingVariantIds.has(vid));
			if (variantsToDelete.length > 0) {
				await tx
					.delete(toolVariant)
					.where(
						and(
							eq(toolVariant.toolId, id),
							inArray(toolVariant.id, variantsToDelete)
						)
					);
			}

			// Two-phase sortOrder for variants (unique constraint on toolId+sortOrder)
			const stillThere = await tx
				.select({ id: toolVariant.id })
				.from(toolVariant)
				.where(eq(toolVariant.toolId, id));
			for (let i = 0; i < stillThere.length; i++) {
				await tx
					.update(toolVariant)
					.set({ sortOrder: -(i + 1), isDefault: false })
					.where(eq(toolVariant.id, stillThere[i].id));
			}
			for (const v of parsed.data.variants) {
				const norm = normalizeVariantValues(v);
				if (v.id) {
					await tx
						.update(toolVariant)
						.set(norm)
						.where(eq(toolVariant.id, v.id));
				} else {
					await tx.insert(toolVariant).values({
						id: crypto.randomUUID(),
						toolId: id,
						...norm,
					});
				}
			}

			// --- Imagens ---
			const existingImages = await tx
				.select({ id: toolImage.id, url: toolImage.url })
				.from(toolImage)
				.where(eq(toolImage.toolId, id));
			const incomingImageIds = new Set(
				parsed.data.images.map((img) => img.id).filter(Boolean) as string[]
			);
			toDelete = existingImages.filter((row) => !incomingImageIds.has(row.id));
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
			const remaining = await tx
				.select({ id: toolImage.id })
				.from(toolImage)
				.where(eq(toolImage.toolId, id));
			for (let i = 0; i < remaining.length; i++) {
				await tx
					.update(toolImage)
					.set({ sortOrder: -(i + 1) })
					.where(eq(toolImage.id, remaining[i].id));
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

			// --- Categorias ---
			await tx.delete(toolCategory).where(eq(toolCategory.toolId, id));
			await tx.insert(toolCategory).values(
				parsed.data.categoryIds.map((catId) => ({
					toolId: id,
					categoryId: catId,
					isPrimary: catId === parsed.data.primaryCategoryId,
				}))
			);

			// --- Atributos dinâmicos ---
			await tx
				.delete(toolAttributeValue)
				.where(eq(toolAttributeValue.toolId, id));
			const attributeRows: (typeof toolAttributeValue.$inferInsert)[] = [];
			for (const [slug, value] of Object.entries(parsed.data.attributeValues)) {
				const def = definitionsBySlug.get(slug);
				if (!def) {
					continue;
				}
				const row = attributeValueRow(def, value);
				if (!row) {
					continue;
				}
				attributeRows.push({ toolId: id, attributeId: def.id, ...row });
			}
			if (attributeRows.length > 0) {
				await tx.insert(toolAttributeValue).values(attributeRows);
			}
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	if (toDelete.length > 0) {
		await Promise.allSettled(toDelete.map((row) => deleteToolImage(row.url)));
	}

	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: { id } };
}

export async function deleteTool(id: string): Promise<ActionResult> {
	await requireCapability("tools.delete");

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
