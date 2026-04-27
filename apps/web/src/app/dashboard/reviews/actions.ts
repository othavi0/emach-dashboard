"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type ModerateReviewInput, moderateReviewSchema } from "./schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const REVIEWS_PATH = "/dashboard/reviews";

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
