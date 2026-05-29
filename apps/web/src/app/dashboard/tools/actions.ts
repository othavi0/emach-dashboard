"use server";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
	toolAttributeAssignment,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { logUserActivity } from "@/lib/activity";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { deleteToolImage } from "./_components/image-actions";
import type { ToolStatusValue } from "./_components/tool-schema";
import {
	type AttributeValueInput,
	slugify,
	type ToolFormValues,
	type ToolVariantInput,
	toolFormSchema,
	type UpdateVariantInput,
	updateVariantSchema,
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
		voltage: v.voltage ? v.voltage : null,
		priceAmount: v.priceAmount.toFixed(2),
		costAmount: toNumericString(v.costAmount ?? null),
		isDefault: v.isDefault,
		sortOrder: v.sortOrder,
	};
}

async function fetchDefinitionsBySlug(
	slugs: string[]
): Promise<Map<string, AttributeDefinition>> {
	if (slugs.length === 0) {
		return new Map();
	}
	const rows = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.slug, slugs));
	return new Map(rows.map((d) => [d.slug, d]));
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
	const session = await requireCapability("tools.create");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	const payload = normalizeToolPayload(parsed.data);
	const slug = slugify(parsed.data.name);

	const definitionsBySlug = await fetchDefinitionsBySlug(
		parsed.data.attributeAssignments
	);

	try {
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transação coesa criando tool, variants, images, categorias, assignments e values em sequência ordenada
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

			const assignmentRows: (typeof toolAttributeAssignment.$inferInsert)[] =
				[];
			let order = 0;
			for (const assignedSlug of parsed.data.attributeAssignments) {
				const def = definitionsBySlug.get(assignedSlug);
				if (!def) {
					continue;
				}
				assignmentRows.push({
					toolId: id,
					attributeId: def.id,
					sortOrder: order++,
				});
			}
			if (assignmentRows.length > 0) {
				await tx.insert(toolAttributeAssignment).values(assignmentRows);
			}

			const assignedSlugs = new Set(parsed.data.attributeAssignments);
			const valueRows: (typeof toolAttributeValue.$inferInsert)[] = [];
			for (const [valueSlug, value] of Object.entries(
				parsed.data.attributeValues
			)) {
				if (!assignedSlugs.has(valueSlug)) {
					continue;
				}
				const def = definitionsBySlug.get(valueSlug);
				if (!def) {
					continue;
				}
				const row = attributeValueRow(def, value);
				if (!row) {
					continue;
				}
				valueRows.push({ toolId: id, attributeId: def.id, ...row });
			}
			if (valueRows.length > 0) {
				await tx.insert(toolAttributeValue).values(valueRows);
			}
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.created",
		targetId: id,
		targetType: "tool",
		metadata: { name: parsed.data.name, slug },
	});
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function updateTool(
	id: string,
	input: ToolFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("tools.update");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const payload = normalizeToolPayload(parsed.data);

	const definitionsBySlug = await fetchDefinitionsBySlug(
		parsed.data.attributeAssignments
	);

	let toDelete: { id: string; url: string }[] = [];

	try {
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transação coesa atualizando 5 entidades (tool, variants, images, categories, attribute assignments + values) com sincronização order-aware
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
			for (const [i, variantRow] of stillThere.entries()) {
				await tx
					.update(toolVariant)
					.set({ sortOrder: -(i + 1), isDefault: false })
					.where(eq(toolVariant.id, variantRow.id));
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
			for (const [i, imageRow] of remaining.entries()) {
				await tx
					.update(toolImage)
					.set({ sortOrder: -(i + 1) })
					.where(eq(toolImage.id, imageRow.id));
			}
			for (const [i, img] of parsed.data.images.entries()) {
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

			// --- Atribuições e valores de atributos ---
			await tx
				.delete(toolAttributeValue)
				.where(eq(toolAttributeValue.toolId, id));
			await tx
				.delete(toolAttributeAssignment)
				.where(eq(toolAttributeAssignment.toolId, id));

			const assignmentRows: (typeof toolAttributeAssignment.$inferInsert)[] =
				[];
			let order = 0;
			for (const assignedSlug of parsed.data.attributeAssignments) {
				const def = definitionsBySlug.get(assignedSlug);
				if (!def) {
					continue;
				}
				assignmentRows.push({
					toolId: id,
					attributeId: def.id,
					sortOrder: order++,
				});
			}
			if (assignmentRows.length > 0) {
				await tx.insert(toolAttributeAssignment).values(assignmentRows);
			}

			const assignedSlugs = new Set(parsed.data.attributeAssignments);
			const valueRows: (typeof toolAttributeValue.$inferInsert)[] = [];
			for (const [valueSlug, value] of Object.entries(
				parsed.data.attributeValues
			)) {
				if (!assignedSlugs.has(valueSlug)) {
					continue;
				}
				const def = definitionsBySlug.get(valueSlug);
				if (!def) {
					continue;
				}
				const row = attributeValueRow(def, value);
				if (!row) {
					continue;
				}
				valueRows.push({ toolId: id, attributeId: def.id, ...row });
			}
			if (valueRows.length > 0) {
				await tx.insert(toolAttributeValue).values(valueRows);
			}
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	if (toDelete.length > 0) {
		await Promise.allSettled(toDelete.map((row) => deleteToolImage(row.url)));
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.updated",
		targetId: id,
		targetType: "tool",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: { id } };
}

export async function deleteTool(id: string): Promise<ActionResult> {
	const session = await requireCapability("tools.delete");

	const [toolRow] = await db
		.select({ name: tool.name })
		.from(tool)
		.where(eq(tool.id, id))
		.limit(1);

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

	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.deleted",
		targetId: id,
		targetType: "tool",
		metadata: { name: toolRow?.name },
	});
	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: undefined };
}

export type ToolSort = "newest" | "name";
export type ToolsListMode = "catalog" | "repor" | "esgotado";

export interface ToolsFiltersInput {
	branchId?: string;
	categoryId?: string;
	mode?: ToolsListMode;
	ncm?: string;
	search?: string;
	sort: ToolSort;
	status?: string;
	visible?: string;
}

interface ToolPageRow extends Record<string, unknown> {
	branches_breakdown: Array<{
		branch_id: string;
		branch_name: string;
		quantity: number;
	}> | null;
	created_at: string;
	default_sku: string | null;
	default_voltage: string | null;
	id: string;
	image_url: string | null;
	model: string | null;
	name: string;
	primary_category_name: string | null;
	reorder_count: number;
	slug: string | null;
	status: string;
	supplier_name: string | null;
	total_stock: number;
	variant_count: number;
	variant_voltages: string[];
	visible_on_site: boolean;
}

function buildToolsWhereClause(
	filters: ToolsFiltersInput,
	decoded: ReturnType<typeof decodeCursor> | null
) {
	const whereParts: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		whereParts.push(sql`t.name ILIKE ${`%${filters.search}%`}`);
	}
	if (filters.categoryId) {
		whereParts.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId})`
		);
	}
	if (filters.visible === "true") {
		whereParts.push(sql`t.visible_on_site = true`);
	} else if (filters.visible === "false") {
		whereParts.push(sql`t.visible_on_site = false`);
	}
	if (filters.status) {
		const statuses = filters.status.split(",").filter(Boolean);
		if (statuses.length > 0) {
			const placeholders = sql.join(
				statuses.map((s) => sql`${s}`),
				sql`, `
			);
			whereParts.push(sql`t.status IN (${placeholders})`);
		}
	}
	if (filters.ncm) {
		whereParts.push(sql`t.ncm ILIKE ${`${filters.ncm}%`}`);
	}
	if (filters.mode === "repor") {
		if (filters.branchId) {
			whereParts.push(sql`
				EXISTS (
					SELECT 1 FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id
					AND sl.reorder_point > 0
					AND sl.quantity <= sl.reorder_point
					AND sl.branch_id = ${filters.branchId}
				)
			`);
		} else {
			whereParts.push(sql`
				EXISTS (
					SELECT 1 FROM stock_level sl
					JOIN tool_variant tv ON tv.id = sl.variant_id
					WHERE tv.tool_id = t.id
					AND sl.reorder_point > 0
					AND sl.quantity <= sl.reorder_point
				)
			`);
		}
	}
	if (filters.mode === "esgotado") {
		// Coerente com o badge "Esgotado": só tools vendáveis (active) sem estoque.
		whereParts.push(sql`t.status = 'active'`);
		whereParts.push(sql`
			NOT EXISTS (
				SELECT 1 FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.quantity > 0
			)
		`);
	}
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			whereParts.push(
				sql`(t.created_at, t.id) < (${decoded.createdAt}::timestamp, ${decoded.id})`
			);
		} else if (filters.sort === "name" && decoded.sort === "name") {
			whereParts.push(sql`(t.name, t.id) > (${decoded.name}, ${decoded.id})`);
		} else {
			throw new Error("Cursor não condiz com sort");
		}
	}
	return whereParts.length
		? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
		: sql``;
}

function buildToolsNextCursor(
	sort: ToolSort,
	last: { id: string; __createdAt: string; __name: string }
): string {
	if (sort === "name") {
		return encodeCursor({ v: 1, sort: "name", name: last.__name, id: last.id });
	}
	return encodeCursor({
		v: 1,
		sort: "newest",
		createdAt: last.__createdAt,
		id: last.id,
	});
}

export async function fetchToolsPage({
	filters,
	cursor,
}: {
	filters: ToolsFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const whereClause = buildToolsWhereClause(filters, decoded);
	const orderClause =
		filters.sort === "name"
			? sql`ORDER BY t.name ASC, t.id ASC`
			: sql`ORDER BY t.created_at DESC, t.id DESC`;

	// Branch filter fragments for stock subqueries
	const branchStockFilter = filters.branchId
		? sql` AND sl.branch_id = ${filters.branchId}`
		: sql``;
	const branchStockFilter2 = filters.branchId
		? sql` AND sl2.branch_id = ${filters.branchId}`
		: sql``;

	const rows = await db.execute<ToolPageRow>(sql`
		SELECT
			t.id, t.name, t.slug,
			(SELECT tv.sku FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_sku,
			(SELECT tv.voltage::text FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_voltage,
			(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
			(SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
				FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_voltages,
			t.model, t.status,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			t.visible_on_site,
			(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id
				WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS primary_category_name,
			s.name AS supplier_name,
			COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id${branchStockFilter}), 0) AS total_stock,
			COALESCE((SELECT COUNT(*)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point${branchStockFilter}), 0) AS reorder_count,
			COALESCE((SELECT json_agg(json_build_object('branch_id', b.id, 'branch_name', b.name, 'quantity', branch_total) ORDER BY b.name ASC)
				FROM (SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
					FROM stock_level sl2 JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
					JOIN branch b2 ON b2.id = sl2.branch_id WHERE tv2.tool_id = t.id${branchStockFilter2} GROUP BY b2.id) g
				JOIN branch b ON b.id = g.bid), '[]'::json) AS branches_breakdown,
			t.created_at::text AS created_at
		FROM tool t
		LEFT JOIN supplier s ON s.id = t.supplier_id
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = rows.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		imageUrl: r.image_url,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		variantSummaries: r.variant_voltages ?? [],
		primaryCategoryName: r.primary_category_name,
		supplierName: r.supplier_name,
		status: r.status as ToolStatusValue,
		visibleOnSite: r.visible_on_site,
		totalStock: Number(r.total_stock ?? 0),
		reorderCount: Number(r.reorder_count ?? 0),
		branches: (r.branches_breakdown ?? []).map((b) => ({
			branchId: b.branch_id,
			branchName: b.branch_name,
			quantity: b.quantity,
		})),
		__createdAt: r.created_at,
		__name: r.name,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last ? buildToolsNextCursor(filters.sort, last) : null;

	const cleanItems: ToolCardData[] = items.map(
		({ __createdAt: _c, __name: _n, ...rest }) => rest
	);

	return { items: cleanItems, nextCursor };
}

export async function updateToolVariant(
	input: UpdateVariantInput
): Promise<ActionResult> {
	const parsed = updateVariantSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos",
		};
	}

	await requireCapability("tools.update");

	try {
		const { variantId, ...fields } = parsed.data;
		// busca toolId pra revalidate
		const [v] = await db
			.select({ toolId: toolVariant.toolId })
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId));

		if (!v) {
			return { ok: false, error: "Variante não encontrada" };
		}

		const updateFields: Record<string, unknown> = {};
		if (fields.sku !== undefined) {
			updateFields.sku = fields.sku;
		}
		if (fields.voltage !== undefined) {
			updateFields.voltage = fields.voltage;
		}
		if (fields.priceAmount !== undefined) {
			updateFields.priceAmount = fields.priceAmount;
		}
		if (fields.costAmount !== undefined) {
			updateFields.costAmount = fields.costAmount;
		}

		if (Object.keys(updateFields).length === 0) {
			return { ok: true, data: undefined };
		}

		updateFields.updatedAt = new Date();

		await db
			.update(toolVariant)
			.set(updateFields)
			.where(eq(toolVariant.id, variantId));

		revalidatePath(`/dashboard/tools/${v.toolId}`);
		revalidatePath("/dashboard/tools");

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateToolVariant falhou", error);
		// SKU duplicado: erro de unique constraint do Postgres
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("unique")
		) {
			return { ok: false, error: "SKU já existe para outra variante" };
		}
		return { ok: false, error: "Não foi possível atualizar a variante" };
	}
}

const setDefaultVariantSchema = z.object({
	toolId: z.string().min(1),
	variantId: z.string().min(1),
});

export async function setDefaultToolVariant(input: {
	toolId: string;
	variantId: string;
}): Promise<ActionResult> {
	const parsed = setDefaultVariantSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.update");

	try {
		const { toolId, variantId } = parsed.data;
		await db.transaction(async (tx) => {
			await tx
				.update(toolVariant)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(eq(toolVariant.toolId, toolId));
			await tx
				.update(toolVariant)
				.set({ isDefault: true, updatedAt: new Date() })
				.where(eq(toolVariant.id, variantId));
		});

		revalidatePath(`/dashboard/tools/${toolId}`);
		revalidatePath("/dashboard/tools");

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("setDefaultToolVariant falhou", error);
		return { ok: false, error: "Não foi possível marcar como padrão" };
	}
}
