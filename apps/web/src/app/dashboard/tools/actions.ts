"use server";

import { db } from "@emach/db";
import {
	toolAttributeAssignment,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { stockLevel } from "@emach/db/schema/inventory";
import { orderItem } from "@emach/db/schema/orders";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { deleteToolImage } from "./_components/image-actions";
import {
	activationRequirementIssues,
	slugify,
	type ToolFormValues,
	toolFormSchema,
	type UpdateVariantInput,
	updateVariantSchema,
} from "./_components/tool-schema";
import { resolveVariantDeletion } from "./_components/variant-deletion";
import { deleteToolVideoObject } from "./_components/video-actions";
import {
	attributeValueRow,
	normalizeToolPayload,
	normalizeVariantValues,
} from "./_lib/tool-query-helpers";
import {
	currentPrimaryCategoryId,
	fetchDefinitionsBySlug,
	fetchToolsPage,
	primaryCategoryIncompleteError,
	type ToolsFiltersInput,
} from "./data";

// Erro de negócio lançado dentro de transação pra abortar com rollback e
// mensagem amigável (o catch genérico mapeia por instanceof).
class VariantMutationBlockedError extends Error {}

// Mapeamento compartilhado dos erros do sync de tool/variantes (create/update).
function mapToolMutationError(error: unknown): { ok: false; error: string } {
	if (error instanceof VariantMutationBlockedError) {
		return { ok: false, error: error.message };
	}
	const pg = getPgError(error);
	if (pg?.code === "23505") {
		if (pg.constraint === "tool_variant_barcode_key") {
			return {
				ok: false,
				error: "Código de barras já cadastrado em outra variante",
			};
		}
		return { ok: false, error: "SKU já existe para outra variante" };
	}
	// Backstop do FK restrict (order_item.variant_id) caso algum caminho de
	// deleção escape dos guards explícitos.
	if (pg?.code === "23503") {
		return {
			ok: false,
			error:
				"Uma variante removida tem vínculos (pedidos) e não pode ser excluída.",
		};
	}
	return { ok: false, error: actionErrorMessage(error) };
}

export async function fetchToolsPageAction(args: {
	filters: ToolsFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	await requireCapability("tools.read");
	return fetchToolsPage(args);
}

const TOOLS_PATH = "/dashboard/tools";

export async function createTool(
	input: ToolFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("tools.create");
	const parsed = toolFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	if (parsed.data.status === "active") {
		const [issue] = activationRequirementIssues(parsed.data);
		if (issue) {
			return { ok: false, error: issue.message };
		}
	}
	const categoryError = await primaryCategoryIncompleteError(
		parsed.data.primaryCategoryId
	);
	if (categoryError) {
		return { ok: false, error: categoryError };
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
		return mapToolMutationError(error);
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
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const [prev] = await db
		.select({ status: tool.status })
		.from(tool)
		.where(eq(tool.id, id))
		.limit(1);
	if (prev?.status !== "active" && parsed.data.status === "active") {
		const [issue] = activationRequirementIssues(parsed.data);
		if (issue) {
			return { ok: false, error: issue.message };
		}
	}
	// Gate só barra quando a primária MUDA para uma incompleta — não punir edição
	// de tool cuja primária já existente degradou (deleção de atributo posterior),
	// senão a ferramenta vira ineditável até alguém consertar a categoria.
	const previousPrimary = await currentPrimaryCategoryId(id);
	if (parsed.data.primaryCategoryId !== previousPrimary) {
		const categoryError = await primaryCategoryIncompleteError(
			parsed.data.primaryCategoryId
		);
		if (categoryError) {
			return { ok: false, error: categoryError };
		}
	}
	const payload = normalizeToolPayload(parsed.data);

	const definitionsBySlug = await fetchDefinitionsBySlug(
		parsed.data.attributeAssignments
	);

	let toDelete: { id: string; url: string }[] = [];
	let prevVideo: { url: string | null; poster: string | null } | undefined;

	try {
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transação coesa atualizando 5 entidades (tool, variants, images, categories, attribute assignments + values) com sincronização order-aware
		await db.transaction(async (tx) => {
			// Captura URLs de vídeo/poster dentro da transação — garante snapshot consistente
			[prevVideo] = await tx
				.select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
				.from(tool)
				.where(eq(tool.id, id));

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
				// Espelha resolveVariantDeletion: variante com pedidos ou estoque não
				// pode ser removida pelo sync do form (o cascade de stock_level
				// apagaria estoque físico sem movimento; ver #335/#336).
				const [orderedBlock] = await tx
					.select({ sku: toolVariant.sku })
					.from(orderItem)
					.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
					.where(inArray(orderItem.variantId, variantsToDelete))
					.limit(1);
				if (orderedBlock) {
					throw new VariantMutationBlockedError(
						`A variante ${orderedBlock.sku} tem pedidos e não pode ser removida. Oculte-a do site.`
					);
				}
				// FOR UPDATE trava as linhas de estoque existentes entre o check e o
				// delete (mesmo rigor do deleteToolVariant; insert concorrente de
				// stock_level novo permanece como janela residual aceita).
				const [stockedBlock] = await tx
					.select({ sku: toolVariant.sku })
					.from(stockLevel)
					.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
					.where(
						and(
							inArray(stockLevel.variantId, variantsToDelete),
							gt(stockLevel.quantity, 0)
						)
					)
					.limit(1)
					.for("update");
				if (stockedBlock) {
					throw new VariantMutationBlockedError(
						`A variante ${stockedBlock.sku} tem estoque em filial. Zere o estoque antes de removê-la.`
					);
				}
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
					// toolId no WHERE barra overwrite cross-tool via id forjado (#338);
					// zero linhas afetadas = payload inválido → rollback (senão o tool
					// poderia terminar sem variante default).
					const updated = await tx
						.update(toolVariant)
						.set(norm)
						.where(and(eq(toolVariant.id, v.id), eq(toolVariant.toolId, id)))
						.returning({ id: toolVariant.id });
					if (updated.length === 0) {
						throw new VariantMutationBlockedError(
							"Variante não pertence a esta ferramenta"
						);
					}
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
						.where(and(eq(toolImage.id, img.id), eq(toolImage.toolId, id)));
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
		return mapToolMutationError(error);
	}

	if (toDelete.length > 0) {
		await Promise.allSettled(toDelete.map((row) => deleteToolImage(row.url)));
	}

	// Limpa objeto de vídeo/poster antigo quando foi removido ou substituído
	if (prevVideo?.url && prevVideo.url !== parsed.data.videoUrl) {
		await deleteToolVideoObject(prevVideo.url).catch(() => undefined);
		if (prevVideo.poster) {
			await deleteToolImage(prevVideo.poster).catch(() => undefined);
		}
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

	const [videoRow] = await db
		.select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
		.from(tool)
		.where(eq(tool.id, id));

	const [orderedForTool] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(orderItem)
		.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
		.where(eq(toolVariant.toolId, id));
	if ((orderedForTool?.n ?? 0) > 0) {
		return {
			ok: false,
			error:
				"Esta ferramenta tem pedidos e não pode ser excluída. Oculte-a do site (visibilidade) em vez disso.",
		};
	}

	try {
		await db.delete(tool).where(eq(tool.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}

	if (urls.length > 0) {
		await Promise.allSettled(urls.map((row) => deleteToolImage(row.url)));
	}

	// Limpa objeto de vídeo/poster do storage após exclusão da ferramenta
	if (videoRow?.url) {
		await deleteToolVideoObject(videoRow.url).catch(() => undefined);
		if (videoRow.poster) {
			await deleteToolImage(videoRow.poster).catch(() => undefined);
		}
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
			updateFields.sku = fields.sku.trim();
		}
		if (fields.barcode !== undefined) {
			updateFields.barcode = fields.barcode.trim();
		}
		if (fields.voltage !== undefined) {
			updateFields.voltage = fields.voltage;
		}
		if (fields.priceAmount !== undefined) {
			updateFields.priceAmount = fields.priceAmount;
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
		// unique_violation do Postgres (SQLSTATE 23505, em e.cause via getPgError).
		// Diferencia constraint de barcode vs SKU; fallback genérico para outros casos.
		const pg = getPgError(error);
		if (pg?.code === "23505") {
			if (pg.constraint === "tool_variant_barcode_key") {
				return {
					ok: false,
					error: "Código de barras já cadastrado em outra variante",
				};
			}
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
			// toolId no WHERE + checagem de linha afetada: variantId de outra
			// ferramenta abortava com a ferramenta alvo zerada de default (#337).
			const updated = await tx
				.update(toolVariant)
				.set({ isDefault: true, updatedAt: new Date() })
				.where(
					and(eq(toolVariant.id, variantId), eq(toolVariant.toolId, toolId))
				)
				.returning({ id: toolVariant.id });
			if (updated.length === 0) {
				throw new VariantMutationBlockedError(
					"Variante não encontrada para esta ferramenta"
				);
			}
		});

		revalidatePath(`/dashboard/tools/${toolId}`);
		revalidatePath("/dashboard/tools");

		return { ok: true, data: undefined };
	} catch (error) {
		if (error instanceof VariantMutationBlockedError) {
			return { ok: false, error: error.message };
		}
		logger.error("setDefaultToolVariant falhou", error);
		return { ok: false, error: "Não foi possível marcar como padrão" };
	}
}

const setVariantVisibilitySchema = z.object({
	variantId: z.string().min(1),
	visible: z.boolean(),
});

export async function setVariantVisibility(input: {
	variantId: string;
	visible: boolean;
}): Promise<ActionResult<{ warning?: "default_hidden" }>> {
	const parsed = setVariantVisibilitySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.update");

	try {
		const { variantId, visible } = parsed.data;
		const [v] = await db
			.select({
				toolId: toolVariant.toolId,
				isDefault: toolVariant.isDefault,
			})
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId));
		if (!v) {
			return { ok: false, error: "Variante não encontrada" };
		}

		await db
			.update(toolVariant)
			.set({ visibleOnSite: visible, updatedAt: new Date() })
			.where(eq(toolVariant.id, variantId));

		revalidatePath(`/dashboard/tools/${v.toolId}`);
		revalidatePath(TOOLS_PATH);

		const warning =
			!visible && v.isDefault ? ("default_hidden" as const) : undefined;
		return { ok: true, data: { warning } };
	} catch (error) {
		logger.error("setVariantVisibility falhou", error);
		return { ok: false, error: "Não foi possível atualizar a visibilidade" };
	}
}

const deleteVariantSchema = z.object({ variantId: z.string().min(1) });

export async function deleteToolVariant(input: {
	variantId: string;
}): Promise<ActionResult<{ reassignedDefaultSku?: string }>> {
	const parsed = deleteVariantSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.delete");

	try {
		const { variantId } = parsed.data;

		// Tudo dentro da transação com FOR UPDATE: trava as variantes do tool
		// para serializar exclusões concorrentes (evita janela de 0 defaults).
		const outcome = await db.transaction(async (tx) => {
			const [v] = await tx
				.select({
					toolId: toolVariant.toolId,
					isDefault: toolVariant.isDefault,
				})
				.from(toolVariant)
				.where(eq(toolVariant.id, variantId))
				.for("update");
			if (!v) {
				return { error: "Variante não encontrada", ok: false as const };
			}

			const [ordered] = await tx
				.select({ n: sql<number>`count(*)::int` })
				.from(orderItem)
				.where(eq(orderItem.variantId, variantId));

			// stock_level.variant_id é ON DELETE CASCADE: excluir variante com
			// estoque apagaria as quantidades sem movimento de ajuste (#335).
			// Sem agregação na query: FOR UPDATE não convive com SUM, e o lock
			// nas linhas de estoque fecha a janela check→delete.
			const stockedRows = await tx
				.select({ quantity: stockLevel.quantity })
				.from(stockLevel)
				.where(eq(stockLevel.variantId, variantId))
				.for("update");
			const stockQty = stockedRows.reduce((sum, r) => sum + r.quantity, 0);

			const siblings = await tx
				.select({
					id: toolVariant.id,
					sku: toolVariant.sku,
					sortOrder: toolVariant.sortOrder,
				})
				.from(toolVariant)
				.where(eq(toolVariant.toolId, v.toolId))
				.orderBy(asc(toolVariant.sortOrder))
				.for("update");

			const decision = resolveVariantDeletion({
				variantId,
				isDefault: v.isDefault,
				hasOrders: (ordered?.n ?? 0) > 0,
				siblings,
				stockQty,
			});
			if (!decision.allowed) {
				return { error: decision.error, ok: false as const };
			}

			await tx.delete(toolVariant).where(eq(toolVariant.id, variantId));

			let reassignedDefaultSku: string | undefined;
			if (decision.reassignDefaultTo) {
				await tx
					.update(toolVariant)
					.set({ isDefault: true, updatedAt: new Date() })
					.where(eq(toolVariant.id, decision.reassignDefaultTo));
				reassignedDefaultSku = siblings.find(
					(s) => s.id === decision.reassignDefaultTo
				)?.sku;
			}

			return { ok: true as const, reassignedDefaultSku, toolId: v.toolId };
		});

		if (!outcome.ok) {
			return { ok: false, error: outcome.error };
		}

		revalidatePath(`/dashboard/tools/${outcome.toolId}`);
		revalidatePath(TOOLS_PATH);
		return {
			ok: true,
			data: { reassignedDefaultSku: outcome.reassignedDefaultSku },
		};
	} catch (error) {
		logger.error("deleteToolVariant falhou", error);
		return { ok: false, error: "Não foi possível excluir a variante" };
	}
}
