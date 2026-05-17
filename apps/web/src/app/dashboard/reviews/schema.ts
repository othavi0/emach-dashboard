import { z } from "zod";

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.optional();

export const reviewsListFiltersSchema = z
	.object({
		tab: z
			.enum(["all", "pending", "approved", "rejected", "spam"])
			.default("all"),
		rating: z.coerce.number().int().min(1).max(5).optional(),
		q: z.string().trim().max(100).optional(),
		from: isoDate,
		to: isoDate,
	})
	.superRefine((data, ctx) => {
		if (data.from && data.to && data.to < data.from) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Data 'até' deve ser >= 'de'",
				path: ["to"],
			});
		}
	});

export type ReviewsListFiltersParsed = z.infer<typeof reviewsListFiltersSchema>;

export const moderateReviewSchema = z
	.object({
		reviewId: z.string().uuid(),
		status: z.enum(["approved", "rejected", "spam"]),
		moderationNote: z.string().max(1000).optional(),
	})
	.superRefine((data, ctx) => {
		if (
			(data.status === "rejected" || data.status === "spam") &&
			!data.moderationNote?.trim()
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Nota de moderação obrigatória ao rejeitar ou marcar como spam",
				path: ["moderationNote"],
			});
		}
	});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
