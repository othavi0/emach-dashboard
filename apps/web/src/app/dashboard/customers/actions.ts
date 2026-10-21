"use server";

import crypto from "node:crypto";
import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import {
	client,
	clientAccount,
	clientAddress,
	clientSession,
	clientVerification,
} from "@emach/db/schema/client";
import { clientAuditLog } from "@emach/db/schema/client-audit";
import { consentLog } from "@emach/db/schema/consent-log";
import { env } from "@emach/env/server";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
	actionErrorMessage,
	isCapabilityError,
	safeRequireRole,
} from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	ANONYMIZED_NAME,
	anonymizedEmail,
	isAnonymizedEmail,
} from "./_lib/anonymized";
import {
	type CustomerListItem,
	type CustomerOrderRow,
	listCustomerOrders,
	listCustomers,
} from "./data";
import {
	anonymizeClientSchema,
	type CustomersListFilters,
	customersListFiltersSchema,
	generatePasswordResetSchema,
	revokeAllClientSessionsSchema,
	revokeClientSessionSchema,
	updateCustomerNotesSchema,
	updateCustomerProfileSchema,
	updateCustomerStatusSchema,
	updateCustomerTypeSchema,
} from "./schema";

function revalidateAll(clientId: string) {
	revalidatePath("/dashboard/customers");
	revalidatePath(`/dashboard/customers/${clientId}`);
}

function genAuditId() {
	return crypto.randomUUID();
}

// ============================================================================
// Listing wrapper para useInfiniteList
// ============================================================================

export async function fetchCustomersPage(input: {
	cursor: string | null;
	filters: unknown;
}): Promise<InfiniteResult<CustomerListItem>> {
	await requireCapability("customers.read");
	const parsed = customersListFiltersSchema.safeParse(input.filters);

	const filters: CustomersListFilters = parsed.success
		? parsed.data
		: customersListFiltersSchema.parse({});

	return listCustomers({ filters, cursor: input.cursor });
}

export async function fetchCustomerOrdersPage(input: {
	clientId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CustomerOrderRow>> {
	await requireCapability("customers.read");

	return listCustomerOrders({ clientId: input.clientId, cursor: input.cursor });
}

// ============================================================================
// updateCustomerProfile (combinada)
// ============================================================================

type ProfileDiff = Record<string, { after: unknown; before: unknown }>;

export async function updateCustomerProfile(
	input: z.input<typeof updateCustomerProfileSchema>
): Promise<ActionResult> {
	const parsed = updateCustomerProfileSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.update_status");

	try {
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: combined diff aggregation + side-effects + audit emission inside single tx
		await db.transaction(async (tx) => {
			const [current] = await tx
				.select()
				.from(client)
				.where(eq(client.id, data.clientId));

			if (!current) {
				throw new Error("Cliente não encontrado");
			}

			const diff: ProfileDiff = {};
			const updates: Partial<typeof client.$inferInsert> = {};

			if (current.name !== data.name) {
				diff.name = { before: current.name, after: data.name };
				updates.name = data.name;
			}

			if (current.email !== data.email) {
				diff.email = { before: current.email, after: data.email };
				updates.email = data.email;
			}

			const newPhone = data.phone ?? null;

			if (current.phone !== newPhone) {
				diff.phone = { before: current.phone, after: newPhone };
				updates.phone = newPhone;
			}

			const newNotes = data.internalNotes ?? null;

			if (current.internalNotes !== newNotes) {
				diff.internalNotes = {
					before: current.internalNotes
						? { length: current.internalNotes.length }
						: null,
					after: newNotes ? { length: newNotes.length } : null,
				};
				updates.internalNotes = newNotes;
			}

			if (current.status !== data.status) {
				diff.status = { before: current.status, after: data.status };
				updates.status = data.status;
			}

			const newType = data.clientType ?? null;

			if (current.clientType !== newType) {
				diff.clientType = { before: current.clientType, after: newType };
				updates.clientType = newType;
			}

			if (Object.keys(updates).length > 0) {
				await tx
					.update(client)
					.set(updates)
					.where(eq(client.id, data.clientId));
			}

			// Side-effect: status novo = blocked → DELETE all sessions
			if (data.status === "blocked" && current.status !== "blocked") {
				await tx
					.delete(clientSession)
					.where(eq(clientSession.userId, data.clientId));
			}

			if (Object.keys(diff).length > 0) {
				await tx.insert(clientAuditLog).values({
					id: genAuditId(),
					clientId: data.clientId,
					action: "profile_updated",
					actorType: "user",
					actorUserId: session.user.id,
					beforeJson: Object.fromEntries(
						Object.entries(diff).map(([k, v]) => [k, v.before])
					),
					afterJson: Object.fromEntries(
						Object.entries(diff).map(([k, v]) => [k, v.after])
					),
					reason: null,
				});
			}
		});

		revalidateAll(data.clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateCustomerProfile", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// updateCustomerStatus (especializada com motivo)
// ============================================================================

export async function updateCustomerStatus(
	input: z.input<typeof updateCustomerStatusSchema>
): Promise<ActionResult> {
	const parsed = updateCustomerStatusSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.update_status");

	try {
		await db.transaction(async (tx) => {
			const [current] = await tx
				.select({ status: client.status })
				.from(client)
				.where(eq(client.id, data.clientId));

			if (!current) {
				throw new Error("Cliente não encontrado");
			}

			if (current.status === data.status) {
				return;
			}

			await tx
				.update(client)
				.set({ status: data.status })
				.where(eq(client.id, data.clientId));

			if (data.status === "blocked") {
				await tx
					.delete(clientSession)
					.where(eq(clientSession.userId, data.clientId));
			}

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "status_changed",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: { status: current.status },
				afterJson: { status: data.status },
				reason: data.reason ?? null,
			});
		});

		revalidateAll(data.clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateCustomerStatus", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// updateCustomerType
// ============================================================================

export async function updateCustomerType(
	input: z.input<typeof updateCustomerTypeSchema>
): Promise<ActionResult> {
	const parsed = updateCustomerTypeSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.update_status");

	try {
		await db.transaction(async (tx) => {
			const [current] = await tx
				.select({ clientType: client.clientType })
				.from(client)
				.where(eq(client.id, data.clientId));

			if (!current) {
				throw new Error("Cliente não encontrado");
			}

			if (current.clientType === data.clientType) {
				return;
			}

			await tx
				.update(client)
				.set({ clientType: data.clientType })
				.where(eq(client.id, data.clientId));

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "type_changed",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: { clientType: current.clientType },
				afterJson: { clientType: data.clientType },
				reason: null,
			});
		});

		revalidateAll(data.clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateCustomerType", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// updateCustomerNotes
// ============================================================================

export async function updateCustomerNotes(
	input: z.input<typeof updateCustomerNotesSchema>
): Promise<ActionResult> {
	const parsed = updateCustomerNotesSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.update_status");

	try {
		await db.transaction(async (tx) => {
			const [current] = await tx
				.select({ internalNotes: client.internalNotes })
				.from(client)
				.where(eq(client.id, data.clientId));

			if (!current) {
				throw new Error("Cliente não encontrado");
			}

			await tx
				.update(client)
				.set({ internalNotes: data.internalNotes })
				.where(eq(client.id, data.clientId));

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "notes_updated",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: current.internalNotes
					? { length: current.internalNotes.length }
					: null,
				afterJson: data.internalNotes
					? { length: data.internalNotes.length }
					: null,
				reason: null,
			});
		});

		revalidateAll(data.clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateCustomerNotes", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// revokeClientSession / revokeAllClientSessions
// ============================================================================

export async function revokeClientSession(
	input: z.input<typeof revokeClientSessionSchema>
): Promise<ActionResult> {
	const parsed = revokeClientSessionSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.manage_sessions");

	try {
		await db.transaction(async (tx) => {
			const deleted = await tx
				.delete(clientSession)
				.where(
					and(
						eq(clientSession.id, data.sessionId),
						eq(clientSession.userId, data.clientId)
					)
				)
				.returning({ id: clientSession.id });

			if (deleted.length === 0) {
				throw new Error("Sessão não encontrada");
			}

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "session_revoked",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: null,
				afterJson: { sessionId: data.sessionId },
				reason: null,
			});
		});

		revalidateAll(data.clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("revokeClientSession", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

export async function revokeAllClientSessions(
	input: z.input<typeof revokeAllClientSessionsSchema>
): Promise<ActionResult<{ count: number }>> {
	const parsed = revokeAllClientSessionsSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.manage_sessions");

	try {
		const result = await db.transaction(async (tx) => {
			const deleted = await tx
				.delete(clientSession)
				.where(eq(clientSession.userId, data.clientId))
				.returning({ id: clientSession.id });

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "sessions_revoked_all",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: null,
				afterJson: { count: deleted.length },
				reason: null,
			});

			return deleted.length;
		});

		revalidateAll(data.clientId);

		return { ok: true, data: { count: result } };
	} catch (error) {
		logger.error("revokeAllClientSessions", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// generatePasswordResetLink
// ============================================================================

const DEFAULT_RESET_BASE = "https://emach.com.br";

export async function generatePasswordResetLink(
	input: z.input<typeof generatePasswordResetSchema>
): Promise<ActionResult<{ expiresAt: Date; url: string }>> {
	const parsed = generatePasswordResetSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const data = parsed.data;
	const session = await requireCapability("customers.reset_password");

	try {
		const result = await db.transaction(async (tx) => {
			const [c] = await tx
				.select({ email: client.email })
				.from(client)
				.where(eq(client.id, data.clientId));

			if (!c) {
				throw new Error("Cliente não encontrado");
			}

			const token = crypto.randomUUID();
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

			await tx.insert(clientVerification).values({
				id: crypto.randomUUID(),
				identifier: c.email,
				value: token,
				expiresAt,
			});

			await tx.insert(clientAuditLog).values({
				id: genAuditId(),
				clientId: data.clientId,
				action: "password_reset_link_generated",
				actorType: "user",
				actorUserId: session.user.id,
				beforeJson: null,
				afterJson: { expiresAt: expiresAt.toISOString() },
				reason: null,
			});

			const base = env.ECOMMERCE_ORIGIN ?? DEFAULT_RESET_BASE;

			return {
				url: `${base}/reset-password?token=${encodeURIComponent(token)}`,
				expiresAt,
			};
		});

		revalidateAll(data.clientId);

		return { ok: true, data: result };
	} catch (error) {
		logger.error("generatePasswordResetLink", error);
		const msg = error instanceof Error ? error.message : "Erro interno";

		return { ok: false, error: msg };
	}
}

// ============================================================================
// anonymizeClient (LGPD, ADR-0029)
// ============================================================================

const ANONYMIZE_REFUSALS = {
	not_found: "Cliente não encontrado",
	already_anonymized: "Cliente já foi anonimizado",
} as const;

type AnonymizeOutcome = keyof typeof ANONYMIZE_REFUSALS | "anonymized";

export async function anonymizeClient(
	input: z.input<typeof anonymizeClientSchema>
): Promise<ActionResult> {
	const parsed = anonymizeClientSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	const { clientId, reason } = parsed.data;
	let session: DashboardSession;

	try {
		session = await requireCapability("customers.anonymize");
	} catch (e) {
		if (isCapabilityError(e)) {
			return safeRequireRole("anonymizeClient", e);
		}

		throw e;
	}

	try {
		const outcome = await db.transaction(
			async (tx): Promise<AnonymizeOutcome> => {
				const [current] = await tx
					.select({ email: client.email })
					.from(client)
					.where(eq(client.id, clientId))
					.for("update");

				if (!current) {
					return "not_found";
				}

				if (isAnonymizedEmail(current.email)) {
					return "already_anonymized";
				}

				const hash = crypto
					.createHash("sha256")
					.update(clientId)
					.digest("hex")
					.slice(0, 12);

				await tx
					.update(client)
					.set({
						name: ANONYMIZED_NAME,
						email: anonymizedEmail(hash),
						emailVerified: false,
						phone: null,
						document: null,
						image: null,
						internalNotes: null,
						status: "blocked",
					})
					.where(eq(client.id, clientId));

				const addresses = await tx
					.delete(clientAddress)
					.where(eq(clientAddress.clientId, clientId))
					.returning({ id: clientAddress.id });

				const sessions = await tx
					.delete(clientSession)
					.where(eq(clientSession.userId, clientId))
					.returning({ id: clientSession.id });

				const accounts = await tx
					.delete(clientAccount)
					.where(eq(clientAccount.userId, clientId))
					.returning({ id: clientAccount.id });

				await tx.delete(clientVerification).where(
					// O reset de senha do Better Auth na loja grava value = id do cliente.
					or(
						eq(clientVerification.identifier, current.email),
						eq(clientVerification.value, clientId)
					)
				);

				await tx.insert(consentLog).values({
					id: crypto.randomUUID(),
					clientId,
					kind: "privacy",
					granted: false,
					version: `anonymization-${new Date().toISOString().slice(0, 10)}`,
				});

				await tx.insert(clientAuditLog).values({
					id: genAuditId(),
					clientId,
					action: "anonymized",
					actorType: "user",
					actorUserId: session.user.id,
					beforeJson: {
						addresses: addresses.length,
						sessions: sessions.length,
						accounts: accounts.length,
					},
					afterJson: { status: "blocked" },
					reason,
				});

				return "anonymized";
			}
		);

		if (outcome !== "anonymized") {
			return { ok: false, error: ANONYMIZE_REFUSALS[outcome] };
		}

		revalidateAll(clientId);

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("anonymizeClient", error);

		return { ok: false, error: actionErrorMessage(error) };
	}
}
