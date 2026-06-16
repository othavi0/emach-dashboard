"use server";

import { db } from "@emach/db";
import { banner } from "@emach/db/schema/banner";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { getPgError } from "@/lib/db-error";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	type BannerFormValues,
	bannerFormSchema,
	MAX_ACTIVE_BANNERS,
} from "./_components/banner-schema";

const BANNERS_PATH = "/dashboard/site/banners";

function errorMessage(error: unknown): string {
	if (getPgError(error)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

async function countActive(excludeId?: string): Promise<number> {
	const where = excludeId
		? and(eq(banner.isActive, true), ne(banner.id, excludeId))
		: eq(banner.isActive, true);
	const [row] = await db.select({ n: count() }).from(banner).where(where);
	return row?.n ?? 0;
}

export async function fetchBanners() {
	await requireCapability("site.update_banners");
	return db
		.select()
		.from(banner)
		.orderBy(asc(banner.sortOrder), asc(banner.createdAt));
}

export async function fetchBanner(id: string) {
	await requireCapability("site.update_banners");
	const [row] = await db
		.select()
		.from(banner)
		.where(eq(banner.id, id))
		.limit(1);
	return row ?? null;
}

export async function createBanner(
	values: BannerFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("site.update_banners");
	const parsed = bannerFormSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos. Revise os campos." };
	}
	const v = parsed.data;

	try {
		if (v.isActive && (await countActive()) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos. Despublique um antes de publicar este.`,
			};
		}
		const [maxRow] = await db
			.select({ max: sql<number>`coalesce(max(${banner.sortOrder}), -1)` })
			.from(banner);
		const id = crypto.randomUUID();
		await db.insert(banner).values({
			id,
			backgroundImageUrl: v.backgroundImageUrl,
			backgroundImageMobileUrl: v.backgroundImageMobileUrl,
			productImageUrl: v.productImageUrl,
			productImageMobileUrl: v.productImageMobileUrl,
			title: v.title,
			subtitle: v.subtitle,
			altText: v.altText,
			badgeText: v.badgeText,
			ctaLabel: v.ctaLabel,
			ctaHref: v.ctaHref,
			ctaVariant: v.ctaVariant,
			layout: v.layout,
			countdownTarget: v.countdownTarget,
			isActive: v.isActive,
			sortOrder: (maxRow?.max ?? -1) + 1,
		});
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.created",
			targetType: "banner",
			targetId: id,
			metadata: { title: v.title },
		});
		revalidatePath(BANNERS_PATH);
		revalidateTag("site-banners", {});
		return { ok: true, data: { id } };
	} catch (error) {
		logger.error("createBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function updateBanner(
	id: string,
	values: BannerFormValues
): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	const parsed = bannerFormSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos. Revise os campos." };
	}
	const v = parsed.data;

	try {
		if (v.isActive && (await countActive(id)) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos. Despublique um antes de publicar este.`,
			};
		}
		await db
			.update(banner)
			.set({
				backgroundImageUrl: v.backgroundImageUrl,
				backgroundImageMobileUrl: v.backgroundImageMobileUrl,
				productImageUrl: v.productImageUrl,
				productImageMobileUrl: v.productImageMobileUrl,
				title: v.title,
				subtitle: v.subtitle,
				altText: v.altText,
				badgeText: v.badgeText,
				ctaLabel: v.ctaLabel,
				ctaHref: v.ctaHref,
				ctaVariant: v.ctaVariant,
				layout: v.layout,
				countdownTarget: v.countdownTarget,
				isActive: v.isActive,
			})
			.where(eq(banner.id, id));
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.updated",
			targetType: "banner",
			targetId: id,
			metadata: { title: v.title },
		});
		revalidatePath(BANNERS_PATH);
		revalidateTag("site-banners", {});
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function toggleBannerActive(
	id: string,
	active: boolean
): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	try {
		if (active && (await countActive(id)) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos.`,
			};
		}
		await db.update(banner).set({ isActive: active }).where(eq(banner.id, id));
		await logUserActivity({
			actorUserId: session.user.id,
			action: active ? "banner.published" : "banner.unpublished",
			targetType: "banner",
			targetId: id,
		});
		revalidatePath(BANNERS_PATH);
		revalidateTag("site-banners", {});
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("toggleBannerActive", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function reorderBanners(
	orderedIds: string[]
): Promise<ActionResult> {
	await requireCapability("site.update_banners");
	try {
		await db.transaction(async (tx) => {
			for (const [index, id] of orderedIds.entries()) {
				await tx
					.update(banner)
					.set({ sortOrder: index })
					.where(eq(banner.id, id));
			}
		});
		revalidatePath(BANNERS_PATH);
		revalidateTag("site-banners", {});
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("reorderBanners", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function deleteBanner(id: string): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	try {
		const [row] = await db
			.select()
			.from(banner)
			.where(eq(banner.id, id))
			.limit(1);
		await db.delete(banner).where(eq(banner.id, id));
		if (row) {
			const { deleteBannerImage } = await import("./_components/image-actions");
			for (const url of [
				row.backgroundImageUrl,
				row.backgroundImageMobileUrl,
				row.productImageUrl,
				row.productImageMobileUrl,
			]) {
				if (url) {
					await deleteBannerImage(url).catch(() => undefined);
				}
			}
		}
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.deleted",
			targetType: "banner",
			targetId: id,
		});
		revalidatePath(BANNERS_PATH);
		revalidateTag("site-banners", {});
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("deleteBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}
