import { z } from "zod";

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.optional();

export const reviewsListFiltersSchema = z
	.object({
		tab: z.enum(["pending", "approved", "rejected", "spam"]).default("pending"),
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

/**
 * Teto de itens por lote. BATCH_SIZE da listagem é 20 (`src/lib/infinite.ts`),
 * então "selecionar todos os carregados" cresce de 20 em 20 — 50 cobre 2 páginas
 * cheias e mantém a payload da server action trivial (~1,8 KB de UUIDs).
 */
export const BULK_MODERATE_LIMIT = 50;

export const bulkModerateReviewsSchema = z
	.object({
		reviewIds: z
			.array(z.string().uuid())
			.min(1, "Selecione ao menos 1 avaliação")
			.max(
				BULK_MODERATE_LIMIT,
				`Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`
			),
		/** Status esperado das avaliações (a aba de origem). Guarda de concorrência:
		 *  o UPDATE só afeta linhas que AINDA estão nesse status. */
		expectedStatus: z.enum(["pending", "approved", "rejected", "spam"]),
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

export type BulkModerateReviewsInput = z.infer<
	typeof bulkModerateReviewsSchema
>;
export type BulkModerateStatus = BulkModerateReviewsInput["status"];

/**
 * Resultado do lote. `stale` = IDs selecionados que o UPDATE não afetou (a
 * avaliação sumiu ou mudou entre a seleção e o submit). Mora aqui, e não em
 * `actions.ts`, porque arquivo "use server" só pode exportar async function.
 */
export interface BulkModerateResult {
	moderatedIds: string[];
	stale: number;
	succeeded: number;
}
