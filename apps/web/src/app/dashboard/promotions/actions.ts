"use server";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { endOfDaySaoPaulo, startOfDaySaoPaulo } from "@/lib/format/date-input";
import type { InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./_components/promotion-schema";
import {
	assertCodeUnique,
	assertFeaturedSlotFree,
	assertTitleUnique,
	buildCouponFields,
	conflict,
	dbErrorMessage,
	safeRequireRole,
} from "./_lib/promotion-query-helpers";
import {
	countToolsWithActivePromotion,
	fetchPromotionsPage,
	type ListPromotionsOptions,
	type PromotionListItem,
} from "./data";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMOTIONS_PATH = "/dashboard/promotions";
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Wrappers — reads called from Client Components
// ---------------------------------------------------------------------------

export async function fetchPromotionsPageAction(args: {
	filters: ListPromotionsOptions;
	cursor: string | null;
}): Promise<InfiniteResult<PromotionListItem>> {
	return await fetchPromotionsPage(args);
}

export async function countToolsWithActivePromotionAction(
	toolIds: string[],
	excludeId?: string
): Promise<number> {
	return await countToolsWithActivePromotion(toolIds, excludeId);
}

// ---------------------------------------------------------------------------
// createPromotion — requires admin
// ---------------------------------------------------------------------------

export async function createPromotion(
	input: PromotionFormValues
): Promise<ActionResult<{ id: string }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	// C2 fix: use createPromotionSchema (includes startsAt past-date guard)
	const parsed = createPromotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;
	const newId = crypto.randomUUID();

	const session = await requireCurrentSession();

	// H1 fix: all checks + insert inside single transaction
	try {
		await db.transaction(async (tx) => {
			await assertTitleUnique(tx, data.type, data.title);
			if (data.type === "promocode" && data.code) {
				await assertCodeUnique(tx, data.code);
			}

			const couponFields = buildCouponFields(data);

			const isFeatured = data.type === "promotion" && data.featured === true;
			if (isFeatured) {
				await assertFeaturedSlotFree(tx);
				await tx
					.update(promotion)
					.set({ featured: false })
					.where(eq(promotion.featured, true));
			}

			await tx.insert(promotion).values({
				id: newId,
				title: data.title,
				description: data.description ?? null,
				type: data.type,
				code: data.type === "promocode" ? (data.code ?? null) : null,
				discountType: data.discountType,
				discountValue: String(data.discountValue),
				appliesToAll: data.appliesToAll,
				...couponFields,
				active: data.active,
				featured: isFeatured,
				startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
				endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
				createdBy: session.user.id,
				updatedBy: session.user.id,
			});

			if (!data.appliesToAll && data.toolIds.length > 0) {
				await tx.insert(promotionTool).values(
					data.toolIds.map((toolId) => ({
						promotionId: newId,
						toolId,
					}))
				);
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: { id: newId } };
}

// ---------------------------------------------------------------------------
// updatePromotion — requires admin
// ---------------------------------------------------------------------------

export async function updatePromotion(
	id: string,
	input: PromotionFormValues
): Promise<ActionResult<{ id: string }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const parsed = promotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;

	const session = await requireCurrentSession();

	// H1 fix: all checks + update inside single transaction
	try {
		await db.transaction(async (tx) => {
			await assertTitleUnique(tx, data.type, data.title, id);
			if (data.type === "promocode" && data.code) {
				await assertCodeUnique(tx, data.code, id);
			}

			const couponFields = buildCouponFields(data);

			const isFeatured = data.type === "promotion" && data.featured === true;
			if (isFeatured) {
				await assertFeaturedSlotFree(tx, id);
				await tx
					.update(promotion)
					.set({ featured: false })
					.where(and(eq(promotion.featured, true), ne(promotion.id, id)));
			}

			await tx
				.update(promotion)
				.set({
					title: data.title,
					description: data.description ?? null,
					type: data.type,
					code: data.type === "promocode" ? (data.code ?? null) : null,
					discountType: data.discountType,
					discountValue: String(data.discountValue),
					appliesToAll: data.appliesToAll,
					...couponFields,
					active: data.active,
					featured: isFeatured,
					startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
					endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
					updatedBy: session.user.id,
				})
				.where(eq(promotion.id, id));

			// Sempre limpa tools existentes; reinserir só se !appliesToAll
			await tx.delete(promotionTool).where(eq(promotionTool.promotionId, id));

			if (!data.appliesToAll && data.toolIds.length > 0) {
				await tx.insert(promotionTool).values(
					data.toolIds.map((toolId) => ({
						promotionId: id,
						toolId,
					}))
				);
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// deletePromotion — requires admin
// ---------------------------------------------------------------------------

export async function deletePromotion(
	id: string
): Promise<ActionResult<undefined>> {
	try {
		await requireCapability("promotions.delete");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	try {
		await db.delete(promotion).where(eq(promotion.id, id));
	} catch (error) {
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// togglePromotionActive — requires admin (promotions.manage)
// ---------------------------------------------------------------------------

export async function togglePromotionActive(
	id: string
): Promise<ActionResult<{ active: boolean }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const session = await requireCurrentSession();

	try {
		const next = await db.transaction(async (tx) => {
			const current = await tx
				.select({ active: promotion.active, type: promotion.type })
				.from(promotion)
				.where(eq(promotion.id, id))
				.limit(1);

			if (current.length === 0 || !current[0]) {
				conflict("Promoção não encontrada");
			}
			const row = current[0];
			if (!row) {
				conflict("Promoção não encontrada");
			}

			const nextActive = !row.active;

			await tx
				.update(promotion)
				.set({ active: nextActive, updatedBy: session.user.id })
				.where(eq(promotion.id, id));

			return nextActive;
		});
		revalidatePath(PROMOTIONS_PATH);
		return { ok: true, data: { active: next } };
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
		return { ok: false, error: dbErrorMessage(error) };
	}
}

// ---------------------------------------------------------------------------
// duplicatePromotion — requires admin (promotions.manage)
// ---------------------------------------------------------------------------

export async function duplicatePromotion(
	id: string
): Promise<ActionResult<{ id: string }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const session = await requireCurrentSession();
	const newId = crypto.randomUUID();

	try {
		await db.transaction(async (tx) => {
			const src = await tx
				.select()
				.from(promotion)
				.where(eq(promotion.id, id))
				.limit(1);
			if (src.length === 0 || !src[0]) {
				conflict("Promoção não encontrada");
			}
			const p = src[0];
			if (!p) {
				conflict("Promoção não encontrada");
			}

			const baseTitle = `${p.title} (cópia)`;
			let candidate = baseTitle;
			let n = 2;
			while (true) {
				const exists = await tx
					.select({ id: promotion.id })
					.from(promotion)
					.where(
						and(eq(promotion.type, p.type), eq(promotion.title, candidate))
					)
					.limit(1);
				if (exists.length === 0) {
					break;
				}
				candidate = `${baseTitle} ${n}`;
				n += 1;
				if (n > 50) {
					conflict("Não foi possível gerar título único para a cópia");
				}
			}

			await tx.insert(promotion).values({
				id: newId,
				title: candidate,
				description: p.description,
				type: p.type,
				code: null,
				discountType: p.discountType,
				discountValue: p.discountValue,
				appliesToAll: p.appliesToAll,
				maxRedemptions: p.maxRedemptions,
				minOrderAmount: p.minOrderAmount,
				redemptionCount: 0,
				active: false,
				startsAt: null,
				endsAt: null,
				createdBy: session.user.id,
				updatedBy: session.user.id,
			});

			if (!p.appliesToAll) {
				const tools = await tx
					.select({ toolId: promotionTool.toolId })
					.from(promotionTool)
					.where(eq(promotionTool.promotionId, id));

				if (tools.length > 0) {
					await tx
						.insert(promotionTool)
						.values(
							tools.map((t) => ({ promotionId: newId, toolId: t.toolId }))
						);
				}
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: { id: newId } };
}
