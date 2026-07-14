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
import { and, eq, inArray } from "drizzle-orm";

import { bulkModerateReviews } from "../actions";
import { BULK_MODERATE_LIMIT, type BulkModerateReviewsInput } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

/** Captura o objeto passado ao .set() para assertions sobre o payload. */
const setSpy = vi.fn();

/**
 * db.update(review).set({...}).where(...).returning({ id }) → linhas.
 * `rows` são as linhas que o RETURNING devolve (o que foi de fato moderado).
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

beforeEach(() => {
	vi.clearAllMocks();
	setSpy.mockClear();
	mockRequireCapability.mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	});
});

describe("bulkModerateReviews", () => {
	it("modera o lote inteiro e reporta succeeded sem stale", async () => {
		setupUpdate([{ id: ID_A }, { id: ID_B }, { id: ID_C }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A, ID_B, ID_C],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: true,
			data: {
				moderatedIds: [ID_A, ID_B, ID_C],
				stale: 0,
				succeeded: 3,
			},
		});
		expect(mockRequireCapability).toHaveBeenCalledExactlyOnceWith(
			"reviews.moderate"
		);
		expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/reviews");
	});

	it("exige nota de moderação ao rejeitar", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "rejected",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("exige nota de moderação ao marcar como spam", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "spam",
			moderationNote: "   ",
			expectedStatus: "pending",
		});

		expect(result.ok).toBe(false);
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("aceita rejeição com nota e grava a nota no set", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
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

	it("não sobrescreve a nota existente ao aprovar sem nota", async () => {
		setupUpdate([{ id: ID_A }]);

		await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(setSpy).toHaveBeenCalledWith(
			expect.not.objectContaining({ moderationNote: expect.anything() })
		);
	});

	it("rejeita lote vazio", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Selecione ao menos 1 avaliação",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("rejeita lote acima do limite", async () => {
		const tooMany = Array.from(
			{ length: BULK_MODERATE_LIMIT + 1 },
			(_unused, i) => `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`
		);

		const result = await bulkModerateReviews({
			reviewIds: tooMany,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: `Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`,
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("reporta stale quando o RETURNING devolve menos linhas que o pedido", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A, ID_B, ID_C],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: true,
			data: { moderatedIds: [ID_A], stale: 2, succeeded: 1 },
		});
	});

	it("falha quando nenhuma linha foi afetada", async () => {
		setupUpdate([]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nenhuma avaliação foi moderada",
		});
	});

	it("loga e devolve erro genérico quando o banco falha", async () => {
		setupUpdateThrows(new Error("connection terminated"));

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Erro ao moderar avaliações",
		});
		expect(mockLoggerError).toHaveBeenCalled();
	});

	it("rejeita quando expectedStatus está ausente (Zod), sem tocar no banco", async () => {
		// Simula um caller desatualizado (ex: build antigo do client) que ainda
		// não manda `expectedStatus` — o Zod tem que barrar antes do banco.
		const legacyInput = { reviewIds: [ID_A], status: "approved" } as Omit<
			BulkModerateReviewsInput,
			"expectedStatus"
		>;

		const result = await bulkModerateReviews(
			legacyInput as BulkModerateReviewsInput
		);

		expect(result.ok).toBe(false);
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("compõe o where com inArray(id) e eq(status, expectedStatus)", async () => {
		setupUpdate([{ id: ID_A }]);

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

		await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
			expectedStatus: "pending",
		});

		expect(capturedWhere).toEqual(
			and(inArray(review.id, [ID_A]), eq(review.status, "pending"))
		);
	});
});
