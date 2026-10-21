import {
	client,
	clientAccount,
	clientAddress,
	clientSession,
	clientVerification,
} from "@emach/db/schema/client";
import { clientAuditLog } from "@emach/db/schema/client-audit";
import { consentLog } from "@emach/db/schema/consent-log";
import type { SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, requireCapability } = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	requireCapability: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/permissions", () => ({ requireCapability }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./data", () => ({
	listCustomerOrders: vi.fn(),
	listCustomers: vi.fn(),
}));

import { anonymizeClient } from "./actions";

const CLIENT_ID = "cli_123";
const ACTOR_ID = "usr_super";
const REASON = "Pedido do titular por email em 2026-10-20";
const TOMBSTONE_EMAIL = /^deleted-[0-9a-f]{12}@anonymized\.local$/;

type WrittenRow = Partial<
	typeof client.$inferInsert & typeof clientAuditLog.$inferInsert
>;

interface Write {
	kind: "update" | "delete" | "insert";
	table: PgTable;
	values?: WrittenRow;
	where?: SQL;
}

function makeTx(current: { email: string } | undefined) {
	const writes: Write[] = [];

	const deletedRows = new Map<PgTable, { id: string }[]>([
		[clientAddress, [{ id: "a1" }, { id: "a2" }]],
		[clientSession, [{ id: "s1" }]],
		[clientAccount, [{ id: "acc1" }]],
	]);

	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: () => Promise.resolve(current ? [current] : []),
				}),
			}),
		}),
		update: (table: PgTable) => ({
			set: (values: WrittenRow) => ({
				where: () => {
					writes.push({ kind: "update", table, values });

					return Promise.resolve();
				},
			}),
		}),
		delete: (table: PgTable) => ({
			where: (where: SQL) => {
				writes.push({ kind: "delete", table, where });

				return Object.assign(Promise.resolve(), {
					returning: () => Promise.resolve(deletedRows.get(table) ?? []),
				});
			},
		}),
		insert: (table: PgTable) => ({
			values: (values: WrittenRow) => {
				writes.push({ kind: "insert", table, values });

				return Promise.resolve();
			},
		}),
	};

	mockTransaction.mockImplementation(
		async (fn: (t: typeof tx) => Promise<void>) => fn(tx)
	);

	return writes;
}

describe("anonymizeClient", () => {
	beforeEach(() => {
		mockTransaction.mockReset();
		requireCapability.mockReset().mockResolvedValue({ user: { id: ACTOR_ID } });
	});

	it("troca a PII de client por tombstone e bloqueia o cliente", async () => {
		const writes = makeTx({ email: "maria@example.com" });

		const out = await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		expect(out).toEqual({ ok: true, data: undefined });
		expect(requireCapability).toHaveBeenCalledWith("customers.anonymize");

		const update = writes.find((w) => w.kind === "update");
		expect(update?.table).toBe(client);
		expect(update?.values).toMatchObject({
			name: "[anonymized]",
			emailVerified: false,
			phone: null,
			document: null,
			image: null,
			internalNotes: null,
			status: "blocked",
		});
		expect(update?.values).toHaveProperty(
			"email",
			expect.stringMatching(TOMBSTONE_EMAIL)
		);
	});

	it("apaga endereços, sessões e contas e só escreve nas tabelas do cliente", async () => {
		const writes = makeTx({ email: "maria@example.com" });

		await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		const deleted = writes
			.filter((w) => w.kind === "delete")
			.map((w) => w.table);

		expect(deleted).toEqual(
			expect.arrayContaining([clientAddress, clientSession, clientAccount])
		);

		const touched = new Set(writes.map((w) => w.table));
		expect(touched).toEqual(
			new Set([
				client,
				clientAddress,
				clientSession,
				clientAccount,
				clientVerification,
				consentLog,
				clientAuditLog,
			])
		);
	});

	it("apaga token de verificação pelo e-mail e pelo id do cliente", async () => {
		const writes = makeTx({ email: "maria@example.com" });

		await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		const del = writes.find(
			(w) => w.kind === "delete" && w.table === clientVerification
		);

		const query = del?.where
			? new PgDialect().sqlToQuery(del.where)
			: { params: [] };

		// O reset de senha do Better Auth na loja grava value = id do cliente.
		expect(query.params).toEqual(
			expect.arrayContaining(["maria@example.com", CLIENT_ID])
		);
	});

	it("grava auditoria com ator, motivo e contagens sem PII", async () => {
		const writes = makeTx({ email: "maria@example.com" });

		await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		const audit = writes.find(
			(w) => w.kind === "insert" && w.table === clientAuditLog
		);

		expect(audit?.values).toMatchObject({
			clientId: CLIENT_ID,
			action: "anonymized",
			actorType: "user",
			actorUserId: ACTOR_ID,
			reason: REASON,
			beforeJson: { addresses: 2, sessions: 1, accounts: 1 },
		});
		expect(JSON.stringify(audit?.values)).not.toContain("maria@example.com");
	});

	it("recusa cliente já anonimizado sem escrever nada", async () => {
		const writes = makeTx({ email: "deleted-abc123def456@anonymized.local" });

		const out = await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		expect(out).toEqual({ ok: false, error: "Cliente já foi anonimizado" });
		expect(writes).toEqual([]);
	});

	it("recusa quem não tem customers.anonymize", async () => {
		requireCapability.mockRejectedValue(
			new Error('Forbidden: capability "customers.anonymize" requerida')
		);

		const out = await anonymizeClient({ clientId: CLIENT_ID, reason: REASON });

		expect(out).toEqual({ ok: false, error: "Acesso negado" });
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("recusa motivo curto antes de checar permissão", async () => {
		const out = await anonymizeClient({ clientId: CLIENT_ID, reason: "curto" });

		expect(out).toEqual({ ok: false, error: "Dados inválidos" });
		expect(mockTransaction).not.toHaveBeenCalled();
	});
});
