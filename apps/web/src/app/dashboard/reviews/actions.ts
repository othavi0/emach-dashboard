"use server";

import { db } from "@emach/db";
import { client } from "@emach/db/schema/client";
import { review } from "@emach/db/schema/reviews";
import { tool } from "@emach/db/schema/tools";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	type CreateEditorialReviewInput,
	createEditorialReviewSchema,
	type ModerateReviewInput,
	moderateReviewSchema,
} from "./schema";

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

export async function createEditorialReview(
	input: CreateEditorialReviewInput
): Promise<ActionResult<{ id: string }>> {
	const parsed = createEditorialReviewSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { toolId, clientId, rating, title, body, status } = parsed.data;

	try {
		const [toolRow] = await db
			.select({ id: tool.id })
			.from(tool)
			.where(eq(tool.id, toolId))
			.limit(1);
		if (!toolRow) {
			return { ok: false, error: "Ferramenta não encontrada" };
		}

		const [clientRow] = await db
			.select({ id: client.id })
			.from(client)
			.where(eq(client.id, clientId))
			.limit(1);
		if (!clientRow) {
			return { ok: false, error: "Cliente não encontrado" };
		}

		const [existing] = await db
			.select({ id: review.id })
			.from(review)
			.where(and(eq(review.clientId, clientId), eq(review.toolId, toolId)))
			.limit(1);
		if (existing) {
			return {
				ok: false,
				error: "Cliente já possui avaliação editorial para esta ferramenta",
			};
		}

		const id = crypto.randomUUID();
		const now = new Date();
		await db.insert(review).values({
			id,
			toolId,
			clientId,
			orderId: null,
			rating,
			title: title ?? null,
			body,
			status,
			verifiedPurchase: false,
			moderatedBy: status === "approved" ? session.user.id : null,
			moderatedAt: status === "approved" ? now : null,
		});

		revalidatePath(REVIEWS_PATH);
		revalidatePath(`/dashboard/tools/${toolId}`);
		return { ok: true, data: { id } };
	} catch (error) {
		logger.error("createEditorialReview", error);
		return { ok: false, error: "Erro ao criar avaliação editorial" };
	}
}
