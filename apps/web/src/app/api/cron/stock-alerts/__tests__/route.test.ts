import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (devem vir antes dos imports do código sob teste) ---

vi.mock("@emach/env/server", () => ({
	env: {
		BETTER_AUTH_URL: "https://admin.test",
		CRON_SECRET: "test-secret-32-chars-minimum-ok",
	},
}));

const {
	mockDbExecute,
	mockDbInsert,
	mockDbTransaction,
	mockSendStockAlertEmail,
} = vi.hoisted(() => ({
	mockDbExecute: vi.fn(),
	mockDbInsert: vi.fn(),
	mockDbTransaction: vi.fn(),
	mockSendStockAlertEmail: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: {
		execute: mockDbExecute,
		insert: mockDbInsert,
		transaction: mockDbTransaction,
	},
}));

vi.mock("@emach/email/send", () => ({
	sendStockAlertEmail: mockSendStockAlertEmail,
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		error: vi.fn(),
	},
}));

// --- imports do código sob teste ---

import { logger } from "@/lib/logger";
import { GET } from "../route";

// --- helpers ---

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRequest(token = "test-secret-32-chars-minimum-ok") {
	return new Request("http://localhost/api/cron/stock-alerts", {
		headers: { authorization: `Bearer ${token}` },
	});
}

interface TestRow {
	alert_level: "critical" | "reorder";
	branch_id: string;
	branch_name: string;
	deficit: number;
	last_alert_level: "critical" | "reorder" | null;
	last_sent_at: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_name: string;
	variant_id: string;
}

function itemRow(overrides: Partial<TestRow> = {}): TestRow {
	return {
		branch_id: "b1",
		branch_name: "Filial Centro",
		variant_id: "v1",
		tool_name: "Parafusadeira 12V",
		sku: "PFD-12V-001",
		quantity: 0,
		min_qty: 2,
		reorder_point: 5,
		deficit: 5,
		alert_level: "critical",
		last_sent_at: null,
		last_alert_level: null,
		...overrides,
	};
}

/** Enfileira o resultado de um db.execute (ordem: itens → destinatários → super admins). */
function queueExecute(rows: unknown[]) {
	mockDbExecute.mockResolvedValueOnce({ rows });
}

/** Moca db.insert(...).values(...).onConflictDoUpdate(...) resolvendo. */
function mockInsertOk() {
	const onConflictDoUpdate = vi.fn(() => Promise.resolve());
	const values = vi.fn(() => ({ onConflictDoUpdate }));
	mockDbInsert.mockImplementation(() => ({ values }));
	return { values };
}

/**
 * Moca db.transaction para executar o callback com um `tx` cujo `insert`
 * reaproveita o mesmo `mockDbInsert` — asserções `toHaveBeenCalledTimes`
 * existentes continuam contando os upserts corretamente.
 */
function mockTransactionOk() {
	mockDbTransaction.mockImplementation(
		(callback: (tx: { insert: typeof mockDbInsert }) => Promise<void>) =>
			callback({ insert: mockDbInsert })
	);
}

// --- testes ---

describe("GET /api/cron/stock-alerts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSendStockAlertEmail.mockResolvedValue(undefined);
		mockInsertOk();
		mockTransactionOk();
	});

	describe("gate de autenticação", () => {
		it("retorna 401 sem header Authorization e não toca o DB", async () => {
			const res = await GET(
				new Request("http://localhost/api/cron/stock-alerts")
			);
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "Unauthorized" });
			expect(mockDbExecute).not.toHaveBeenCalled();
		});

		it("retorna 401 com secret errado e não toca o DB", async () => {
			const res = await GET(makeRequest("token-errado"));
			expect(res.status).toBe(401);
			expect(mockDbExecute).not.toHaveBeenCalled();
		});
	});

	describe("sem itens abaixo do ponto", () => {
		it("retorna zeros e não consulta destinatários", async () => {
			queueExecute([]);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
			expect(mockDbExecute).toHaveBeenCalledTimes(1);
			expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("1 filial com admin e 2 itens → 1 e-mail, 2 upserts", async () => {
			queueExecute([
				itemRow(),
				itemRow({
					variant_id: "v2",
					sku: "FUR-500W-002",
					tool_name: "Furadeira 500W",
					quantity: 3,
					reorder_point: 8,
					deficit: 5,
					alert_level: "reorder",
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 1,
				branchesSkipped: 0,
				itemsAlerted: 2,
			});
			expect(mockSendStockAlertEmail).toHaveBeenCalledTimes(1);
			expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: ["admin@filial.com"],
					branchName: "Filial Centro",
					dashboardUrl:
						"https://admin.test/dashboard/tools?mode=repor&branchId=b1",
				})
			);
			expect(mockDbInsert).toHaveBeenCalledTimes(2);
		});
	});

	describe("cooldown de 7 dias", () => {
		it("exclui item alertado há 2 dias no mesmo nível", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({
					last_sent_at: twoDaysAgo,
					last_alert_level: "critical",
				}),
				itemRow({
					variant_id: "v2",
					sku: "FUR-500W-002",
					alert_level: "reorder",
					last_sent_at: null,
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
			const call = mockSendStockAlertEmail.mock.calls[0]?.[0] as {
				items: Array<{ sku: string }>;
			};
			expect(call.items).toHaveLength(1);
			expect(call.items[0]?.sku).toBe("FUR-500W-002");
			expect(mockDbInsert).toHaveBeenCalledTimes(1);
		});

		it("re-alerta item cujo cooldown expirou (8 dias)", async () => {
			const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS).toISOString();
			queueExecute([
				itemRow({ last_sent_at: eightDaysAgo, last_alert_level: "critical" }),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
		});

		it("escalada reorder→critical fura o cooldown", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({
					alert_level: "critical",
					last_sent_at: twoDaysAgo,
					last_alert_level: "reorder",
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
		});

		it("com todos os itens em cooldown, retorna zeros sem consultar destinatários", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({ last_sent_at: twoDaysAgo, last_alert_level: "critical" }),
			]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
			expect(mockDbExecute).toHaveBeenCalledTimes(1);
		});
	});

	describe("destinatários", () => {
		it("filial sem admin usa fallback de super_admins", async () => {
			queueExecute([itemRow()]);
			queueExecute([]); // nenhum admin em user_branch
			queueExecute([
				{ email: "root1@emach.com" },
				{ email: "root2@emach.com" },
			]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, branchesSkipped: 0 })
			);
			expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: ["root1@emach.com", "root2@emach.com"],
				})
			);
		});

		it("sem admin e sem super_admin, pula a filial e loga no_recipients", async () => {
			queueExecute([itemRow()]);
			queueExecute([]);
			queueExecute([]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 1,
				itemsAlerted: 0,
			});
			expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
			expect(logger.error).toHaveBeenCalledWith(
				"stockAlertsCron",
				expect.objectContaining({ branchId: "b1", reason: "no_recipients" })
			);
		});
	});

	describe("isolamento de erro por filial", () => {
		it("falha no envio de uma filial não aborta o batch nem grava upsert dela", async () => {
			queueExecute([
				itemRow(),
				itemRow({
					branch_id: "b2",
					branch_name: "Filial Norte",
					variant_id: "v2",
					sku: "FUR-500W-002",
				}),
			]);
			queueExecute([
				{ branch_id: "b1", email: "admin1@filial.com" },
				{ branch_id: "b2", email: "admin2@filial.com" },
			]);
			mockSendStockAlertEmail
				.mockRejectedValueOnce(new Error("Resend down"))
				.mockResolvedValueOnce(undefined);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 1,
				branchesSkipped: 1,
				itemsAlerted: 1,
			});
			// upsert só da filial que enviou com sucesso (1 item)
			expect(mockDbInsert).toHaveBeenCalledTimes(1);
			expect(logger.error).toHaveBeenCalledWith(
				"stockAlertsCron",
				expect.objectContaining({ branchId: "b1" })
			);
		});
	});

	describe("erro na query principal", () => {
		it("retorna 500 e loga", async () => {
			mockDbExecute.mockRejectedValueOnce(new Error("DB down"));

			const res = await GET(makeRequest());
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({ ok: false, error: "Internal error" });
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe("transação de upsert atômica", () => {
		it("falha no 2º upsert rejeita a transação inteira e a filial cai no catch, mesmo com o e-mail já enviado", async () => {
			queueExecute([
				itemRow(),
				itemRow({
					variant_id: "v2",
					sku: "FUR-500W-002",
					tool_name: "Furadeira 500W",
					quantity: 3,
					reorder_point: 8,
					deficit: 5,
					alert_level: "reorder",
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			// tx.insert do 2º item rejeita → db.transaction() rejeita por inteiro
			// (all-or-nothing: nenhum dos dois upserts fica gravado).
			mockDbTransaction.mockImplementationOnce(() =>
				Promise.reject(new Error("upsert do 2º item falhou"))
			);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 1,
				itemsAlerted: 0,
			});
			// o e-mail já tinha sido enviado antes da transação falhar
			expect(mockSendStockAlertEmail).toHaveBeenCalledTimes(1);
			expect(logger.error).toHaveBeenCalledWith(
				"stockAlertsCron",
				expect.objectContaining({ branchId: "b1" })
			);
		});
	});
});
