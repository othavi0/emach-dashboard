"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { listReviews, type ReviewListItem } from "./data";
import {
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
