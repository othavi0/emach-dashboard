import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — precisam existir antes das factories de vi.mock
// ---------------------------------------------------------------------------

const {
	mockDbUpdate,
	mockRequireCapability,
	mockLoggerError,
	mockRevalidatePath,
} = vi.hoisted(() => ({
	mockDbUpdate: vi.fn(),
	mockRequireCapability: vi.fn(),
	mockLoggerError: vi.fn(),
	mockRevalidatePath: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { update: mockDbUpdate },
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: mockRevalidatePath,
	revalidateTag: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import depois dos mocks
// ---------------------------------------------------------------------------

import { review } from "@emach/db/schema/reviews";
import { and, eq } from "drizzle-orm";

import { moderateReview } from "../actions";
import type { ModerateReviewInput } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_A = "11111111-1111-4111-8111-111111111111";

/** Captura o objeto passado ao .set() para assertions sobre o payload. */
const setSpy = vi.fn();

/**
 * db.update(review).set({...}).where(...).returning({ id }) → linhas.
 * `rows` vazio = a guarda de status não casou (alguém moderou antes).
 */
function setupUpdate(rows: Array<{ id: string }>) {
	mockDbUpdate.mockReturnValue({
		set: (payload: unknown) => {
			setSpy(payload);
			return {
				where: () => ({
					returning: () => Promise.resolve(rows),
				}),
			};
		},
	});
}

/** db.update lança — simula erro de banco. */
function setupUpdateThrows(error: unknown) {
	mockDbUpdate.mockReturnValue({
		set: () => ({
			where: () => ({
				returning: () => Promise.reject(error),
			}),
		}),
	});
}

const CONFLICT_ERROR =
	"Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada.";

beforeEach(() => {
	vi.clearAllMocks();
	setSpy.mockClear();
	mockRequireCapability.mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	});
});

describe("moderateReview", () => {
	it("modera a avaliação quando o status ainda é o esperado", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(mockRequireCapability).toHaveBeenCalledExactlyOnceWith(
			"reviews.moderate"
		);
		expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/reviews");
		expect(mockRevalidatePath).toHaveBeenCalledWith(
			`/dashboard/reviews/${ID_A}`
		);
	});

	it("compõe o where com eq(id) e eq(status, expectedStatus)", async () => {
		let capturedWhere: unknown;
		mockDbUpdate.mockReturnValue({
			set: (payload: unknown) => {
				setSpy(payload);
				return {
					where: (whereArg: unknown) => {
						capturedWhere = whereArg;
						return { returning: () => Promise.resolve([{ id: ID_A }]) };
					},
				};
			},
		});

		await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(capturedWhere).toEqual(
			and(eq(review.id, ID_A), eq(review.status, "pending"))
		);
	});

	it("devolve conflito quando nenhuma linha foi afetada, e ainda revalida", async () => {
		setupUpdate([]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: false, error: CONFLICT_ERROR });
		// Revalidar mesmo no conflito: sem isso o router.refresh() do client pode
		// servir de volta o estado velho que causou o conflito.
		expect(mockRevalidatePath).toHaveBeenCalledWith(
			`/dashboard/reviews/${ID_A}`
		);
	});

	it("não sobrescreve a nota existente ao aprovar sem nota", async () => {
		setupUpdate([{ id: ID_A }]);

		await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(setSpy).toHaveBeenCalledWith(
			expect.not.objectContaining({ moderationNote: expect.anything() })
		);
	});

	it("grava a nota (trimada) ao rejeitar", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "rejected",
			moderationNote: "  conteúdo ofensivo  ",
			expectedStatus: "pending",
		});

		expect(result.ok).toBe(true);
		expect(setSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "rejected",
				moderatedBy: "actor-1",
				moderationNote: "conteúdo ofensivo",
			})
		);
	});

	it("exige nota de moderação ao rejeitar", async () => {
		const result = await moderateReview({
			reviewId: ID_A,
			status: "rejected",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("rejeita quando expectedStatus está ausente (Zod), sem tocar no banco", async () => {
		// Simula um caller desatualizado (ex: build antigo do client) que ainda
		// não manda `expectedStatus` — o Zod tem que barrar antes do banco.
		const legacyInput = { reviewId: ID_A, status: "approved" } as Omit<
			ModerateReviewInput,
			"expectedStatus"
		>;

		const result = await moderateReview(legacyInput as ModerateReviewInput);

		expect(result.ok).toBe(false);
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("loga e devolve erro genérico quando o banco falha", async () => {
		setupUpdateThrows(new Error("connection terminated"));

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: false, error: "Erro ao moderar avaliação" });
		expect(mockLoggerError).toHaveBeenCalled();
	});
});
