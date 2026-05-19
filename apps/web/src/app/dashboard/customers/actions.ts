"use server";

import crypto from "node:crypto";
import { db } from "@emach/db";
import {
	client,
	clientSession,
	clientVerification,
} from "@emach/db/schema/client";
import { clientAuditLog } from "@emach/db/schema/client-audit";
import { env } from "@emach/env/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type CustomerListItem, listCustomers } from "./data";
import {
	type CustomerPendingKind,
	fetchCustomerActivityPage as fetchCustomerActivityPageImpl,
	fetchPendingCustomersPage as fetchPendingCustomersPageImpl,
} from "./pending-data";
import {
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

export type ActionResult<T = undefined> =
	| { data: T; ok: true }
	| { error: string; ok: false };

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

// ============================================================================
// updateCustomerProfile (combinada)
// ============================================================================

type ProfileDiff = Record<string, { after: unknown; before: unknown }>;

export async function updateCustomerProfile(
	input: unknown
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
	input: unknown
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
	input: unknown
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
	input: unknown
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
	input: unknown
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
	input: unknown
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
	input: unknown
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
// Pending customers — wrapper para useInfiniteList
// ============================================================================

export async function fetchPendingCustomersPage(args: {
	cursor: string | null;
	kind: CustomerPendingKind;
}): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("customers.read");
	return fetchPendingCustomersPageImpl(args);
}

export async function fetchPendingBlockedCustomersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("customers.read");
	return fetchPendingCustomersPageImpl({ kind: "blocked", cursor });
}

export async function fetchPendingNoDocumentCustomersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("customers.read");
	return fetchPendingCustomersPageImpl({ kind: "no_doc", cursor });
}

export async function fetchPendingInactiveOrderCustomersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("customers.read");
	return fetchPendingCustomersPageImpl({ kind: "inactive_open_order", cursor });
}

export async function fetchPendingUnverifiedCustomersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("customers.read");
	return fetchPendingCustomersPageImpl({ kind: "unverified_new", cursor });
}

// ============================================================================
// Customer activity — wrapper para useInfiniteList
// ============================================================================

export async function fetchCustomerActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCapability("customers.read");
	return fetchCustomerActivityPageImpl(cursor);
}
