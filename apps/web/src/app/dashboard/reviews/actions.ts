"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { listReviews, type ReviewListItem } from "./data";
import {
	type BulkModerateResult,
	type BulkModerateReviewsInput,
	bulkModerateReviewsSchema,
	type ModerateReviewInput,
	moderateReviewSchema,
	type ReviewsListFiltersParsed,
} from "./schema";
import { REVIEW_TABS } from "./status-meta";

const REVIEWS_PATH = "/dashboard/reviews";

/** Página keyset da listagem (usada pela página inicial e pelo scroll infinito). */
export async function fetchReviewsPage({
	filters,
	cursor,
}: {
	cursor: string | null;
	filters: ReviewsListFiltersParsed;
}): Promise<InfiniteResult<ReviewListItem>> {
	await requireCapability("reviews.read");
	const tab = REVIEW_TABS.find((t) => t.key === filters.tab) ?? REVIEW_TABS[0];
	return listReviews({
		status: tab.status,
		rating: filters.rating,
		q: filters.q,
		from: filters.from,
		to: filters.to,
		cursor,
	});
}

export async function moderateReview(
	input: ModerateReviewInput
): Promise<ActionResult> {
	const parsed = moderateReviewSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { reviewId, status, moderationNote } = parsed.data;

	try {
		await db
			.update(review)
			.set({
				status,
				moderatedBy: session.user.id,
				moderatedAt: new Date(),
				moderationNote: moderationNote ?? null,
			})
			.where(eq(review.id, reviewId));

		revalidatePath(REVIEWS_PATH);
		revalidatePath(`${REVIEWS_PATH}/${reviewId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("moderateReview", error);
		return { ok: false, error: "Erro ao moderar avaliação" };
	}
}

/**
 * Modera N avaliações num único UPDATE ... WHERE id IN (...) RETURNING id.
 * Reviews são globais (sem branch-scoping): um requireCapability antes da query
 * basta — não há autorização por item a fazer. As linhas devolvidas pelo
 * RETURNING são a verdade sobre o que foi moderado; o que não voltou é `stale`.
 */
export async function bulkModerateReviews(
	input: BulkModerateReviewsInput
): Promise<ActionResult<BulkModerateResult>> {
	const parsed = bulkModerateReviewsSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { reviewIds, status, moderationNote, expectedStatus } = parsed.data;
	const note = moderationNote?.trim();

	try {
		const moderated = await db
			.update(review)
			.set({
				status,
				moderatedBy: session.user.id,
				moderatedAt: new Date(),
				// Sem nota (caso da aprovação) → a coluna não entra no SET: aprovar em
				// lote não apaga a nota de moderação anterior.
				...(note ? { moderationNote: note } : {}),
			})
			.where(
				and(
					inArray(review.id, reviewIds),
					// Guarda de concorrência: uma avaliação que outra pessoa moderou entre
					// a seleção e o submit não casa, não volta no RETURNING e vira `stale`.
					eq(review.status, expectedStatus)
				)
			)
			.returning({ id: review.id });

		revalidatePath(REVIEWS_PATH);

		if (moderated.length === 0) {
			return { ok: false, error: "Nenhuma avaliação foi moderada" };
		}

		return {
			ok: true,
			data: {
				moderatedIds: moderated.map((row) => row.id),
				stale: reviewIds.length - moderated.length,
				succeeded: moderated.length,
			},
		};
	} catch (error) {
		const pg = getPgError(error);
		logger.error("bulkModerateReviews", { err: error, code: pg?.code });
		return { ok: false, error: "Erro ao moderar avaliações" };
	}
}
