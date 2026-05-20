"use server";

import { authDashboard } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import {
	session as sessionTable,
	user as userTable,
} from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { orderNote, orderStatusHistory } from "@emach/db/schema/orders";
import { promotion } from "@emach/db/schema/promotions";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { requireCapabilityWithContext } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

import {
	type ApproveUserInput,
	approveUserSchema,
	branchLinkSchema,
	revokeSessionSchema,
	triggerPasswordResetSchema,
	type UpdateUserInput,
	updateUserSchema,
	userIdSchema,
} from "./schema";

const USERS_PATH = "/dashboard/users";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export async function approveUser(
	input: ApproveUserInput
): Promise<ActionResult> {
	const parsed = approveUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
		targetBranchIds: parsed.data.branchIds,
	});

	if (parsed.data.role === "super_admin" || parsed.data.role === "admin") {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(userTable)
				.set({ role: parsed.data.role, status: "active" })
				.where(eq(userTable.id, parsed.data.userId));
			if (parsed.data.branchIds.length > 0) {
				await tx
					.delete(userBranch)
					.where(eq(userBranch.userId, parsed.data.userId));
				await tx.insert(userBranch).values(
					parsed.data.branchIds.map((branchId) => ({
						userId: parsed.data.userId,
						branchId,
					}))
				);
			}
		});
	} catch (error) {
		logger.error("approveUser falhou", error);
		return { ok: false, error: "Não foi possível aprovar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.approved",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { role: parsed.data.role, branchIds: parsed.data.branchIds },
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function rejectUser(input: {
	userId: string;
	reason?: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({ status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) {
		return { ok: false, error: "User não encontrado" };
	}
	if (target.status !== "pending") {
		return { ok: false, error: "Só pendentes podem ser rejeitados" };
	}

	try {
		await db.delete(userTable).where(eq(userTable.id, parsed.data.userId));
	} catch (error) {
		logger.error("rejectUser falhou", error);
		return { ok: false, error: "Não foi possível rejeitar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.rejected",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: (input as { reason?: string }).reason
			? { reason: (input as { reason?: string }).reason }
			: undefined,
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function updateUser(
	input: UpdateUserInput
): Promise<ActionResult> {
	const parsed = updateUserSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	let session = await requireCurrentSession();

	try {
		const [current] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, parsed.data.userId));
		if (!current) {
			return { ok: false, error: "Usuário não encontrado" };
		}
		const currentBranchIds = (
			await db
				.select({ branchId: userBranch.branchId })
				.from(userBranch)
				.where(eq(userBranch.userId, parsed.data.userId))
		).map((r) => r.branchId);

		const roleChanged =
			parsed.data.role !== undefined && parsed.data.role !== current.role;
		const branchesChanged =
			parsed.data.branchIds !== undefined &&
			(parsed.data.branchIds.length !== currentBranchIds.length ||
				parsed.data.branchIds.some((id) => !currentBranchIds.includes(id)));
		const nameChanged = parsed.data.name !== undefined;

		if (roleChanged) {
			session = await requireCapabilityWithContext("users.update_role", {
				targetUserId: parsed.data.userId,
			});
		}
		if (branchesChanged) {
			session = await requireCapabilityWithContext("users.update_branches", {
				targetUserId: parsed.data.userId,
				targetBranchIds: parsed.data.branchIds,
			});
		}
		if (nameChanged) {
			session = await requireCapabilityWithContext("users.manage", {
				targetUserId: parsed.data.userId,
			});
		}

		await db.transaction(async (tx) => {
			const update: { name?: string; role?: ApproveUserInput["role"] } = {};
			if (parsed.data.name) {
				update.name = parsed.data.name;
			}
			if (parsed.data.role) {
				update.role = parsed.data.role;
			}
			if (Object.keys(update).length > 0) {
				await tx
					.update(userTable)
					.set(update)
					.where(eq(userTable.id, parsed.data.userId));
			}
			if (parsed.data.branchIds) {
				await tx
					.delete(userBranch)
					.where(eq(userBranch.userId, parsed.data.userId));
				if (parsed.data.branchIds.length > 0) {
					await tx.insert(userBranch).values(
						parsed.data.branchIds.map((branchId) => ({
							userId: parsed.data.userId,
							branchId,
						}))
					);
				}
			}
		});
	} catch (error) {
		logger.error("updateUser falhou", error);
		const message =
			error instanceof Error ? error.message : "Não foi possível atualizar";
		return { ok: false, error: message };
	}

	const changes: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) {
		changes.name = parsed.data.name;
	}
	if (parsed.data.role !== undefined) {
		changes.role = parsed.data.role;
	}
	if (parsed.data.branchIds !== undefined) {
		changes.branchIds = parsed.data.branchIds;
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.updated",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { changes },
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function suspendUser(input: {
	userId: string;
	reason?: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.suspend", {
		targetUserId: parsed.data.userId,
	});

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(userTable)
				.set({ status: "suspended" })
				.where(eq(userTable.id, parsed.data.userId));
			await tx
				.delete(sessionTable)
				.where(eq(sessionTable.userId, parsed.data.userId));
		});
	} catch (error) {
		logger.error("suspendUser falhou", error);
		return { ok: false, error: "Não foi possível suspender" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.suspended",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: (input as { reason?: string }).reason
			? { reason: (input as { reason?: string }).reason }
			: undefined,
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function reactivateUser(input: {
	userId: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.suspend", {
		targetUserId: parsed.data.userId,
	});

	try {
		await db
			.update(userTable)
			.set({ status: "active" })
			.where(eq(userTable.id, parsed.data.userId));
	} catch (error) {
		logger.error("reactivateUser falhou", error);
		return { ok: false, error: "Não foi possível reativar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.reactivated",
		targetType: "user",
		targetId: parsed.data.userId,
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function triggerPasswordReset(
	input: unknown
): Promise<ActionResult> {
	const session = await requireCurrentSession();
	const parsed = triggerPasswordResetSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	await requireCapabilityWithContext("users.reset_password", {
		targetUserId: parsed.data.userId,
	});

	const target = await db.query.user.findFirst({
		where: eq(userTable.id, parsed.data.userId),
	});
	if (!target) {
		return { ok: false, error: "Usuário não encontrado" };
	}

	try {
		await authDashboard.api.requestPasswordReset({
			body: {
				email: target.email,
				redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
			},
		});
		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.password_reset_triggered",
			targetType: "user",
			targetId: parsed.data.userId,
		});
	} catch (error) {
		logger.error("triggerPasswordReset falhou", error);
		return { ok: false, error: "Falha ao enviar e-mail de reset" };
	}

	return { ok: true, data: undefined };
}

export async function deleteUser(input: {
	userId: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.delete", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({ role: userTable.role, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) {
		return { ok: false, error: "User não encontrado" };
	}

	if (target.role === "super_admin") {
		const [row] = await db
			.select({ value: sql<number>`count(*)::int` })
			.from(userTable)
			.where(
				and(eq(userTable.role, "super_admin"), eq(userTable.status, "active"))
			);
		const active = row?.value ?? 0;
		if (active <= 1) {
			return {
				ok: false,
				error: "Necessário ao menos 1 super_admin ativo",
			};
		}
	}

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(stockMovement)
				.set({ actorType: "system", actorId: null })
				.where(eq(stockMovement.actorId, parsed.data.userId));
			await tx
				.update(orderStatusHistory)
				.set({ actorType: "system", actorUserId: null })
				.where(eq(orderStatusHistory.actorUserId, parsed.data.userId));
			await tx
				.update(orderNote)
				.set({ authorId: null })
				.where(eq(orderNote.authorId, parsed.data.userId));
			await tx
				.update(promotion)
				.set({ createdBy: null })
				.where(eq(promotion.createdBy, parsed.data.userId));
			await tx
				.update(promotion)
				.set({ updatedBy: null })
				.where(eq(promotion.updatedBy, parsed.data.userId));
			await tx.delete(userTable).where(eq(userTable.id, parsed.data.userId));
		});
	} catch (error) {
		logger.error("deleteUser falhou", error);
		return { ok: false, error: "Não foi possível deletar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.deleted",
		targetType: "user",
		targetId: parsed.data.userId,
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function revokeUserSession(input: unknown): Promise<ActionResult> {
	await requireCapabilityWithContext("users.revoke_sessions", {});
	const actor = await requireCurrentSession();
	const parsed = revokeSessionSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const target = await db.query.session.findFirst({
		where: eq(sessionTable.id, parsed.data.sessionId),
	});
	if (!target) {
		return { ok: false, error: "Sessão não encontrada" };
	}

	await db
		.delete(sessionTable)
		.where(eq(sessionTable.id, parsed.data.sessionId));
	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.session_revoked",
		targetType: "user",
		targetId: target.userId,
		metadata: { sessionId: target.id },
	});
	revalidatePath(`/dashboard/users/${target.userId}`);
	return { ok: true, data: undefined };
}

export async function forceLogoutAllSessions(
	input: unknown
): Promise<ActionResult<{ count: number }>> {
	await requireCapabilityWithContext("users.revoke_sessions", {});
	const actor = await requireCurrentSession();
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const deleted = await db
		.delete(sessionTable)
		.where(eq(sessionTable.userId, parsed.data.userId))
		.returning({ id: sessionTable.id });

	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.all_sessions_revoked",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { count: deleted.length },
	});
	revalidatePath(`/dashboard/users/${parsed.data.userId}`);
	return { ok: true, data: { count: deleted.length } };
}

export async function linkUserToBranch(input: unknown): Promise<ActionResult> {
	await requireCapabilityWithContext("users.update_branches", {});
	const actor = await requireCurrentSession();
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	await db
		.insert(userBranch)
		.values({
			userId: parsed.data.userId,
			branchId: parsed.data.branchId,
		})
		.onConflictDoNothing();

	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.branch_linked",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { branchId: parsed.data.branchId },
	});
	revalidatePath(`/dashboard/users/${parsed.data.userId}`);
	return { ok: true, data: undefined };
}

export async function fetchMoreUsersAction(
	filters: import("./data").UserListFilters,
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<import("./data").UserListRow>
> {
	await requireCapabilityWithContext("users.manage", {});
	const { fetchUsersPage } = await import("./data");
	return fetchUsersPage({ ...filters, cursor });
}

export async function fetchPendingUsersAction(
	cursor: string
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("@/components/pending-panel").PendingRow
	>
> {
	await requireCapabilityWithContext("users.approve", {});
	const { fetchPendingUsersPage } = await import("./data");
	return fetchPendingUsersPage(cursor);
}

export async function fetchUserActivityFeedPage(
	_cursor: string
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("@/components/activity-feed").ActivityEvent
	>
> {
	await requireCapabilityWithContext("users.manage", {});
	const { getRecentUserActivity } = await import("./data");
	// For paginated feed we reuse getRecentUserActivity with a larger limit;
	// full cursor-based pagination can be added in a later task.
	const rows = await getRecentUserActivity(20);
	return {
		items: rows.map((a) => ({
			id: a.id,
			kind: "user" as const,
			primary: humanizeActivityAction(a.action, a.actorName ?? "—"),
			at: a.createdAt,
			href: a.targetId ? `/dashboard/users/${a.targetId}` : undefined,
		})),
		nextCursor: null,
	};
}

function humanizeActivityAction(action: string, actorName: string): string {
	switch (action) {
		case "user.approved":
			return `${actorName} aprovou usuário`;
		case "user.rejected":
			return `${actorName} rejeitou usuário`;
		case "user.updated":
			return `${actorName} atualizou usuário`;
		case "user.suspended":
			return `${actorName} suspendeu usuário`;
		case "user.reactivated":
			return `${actorName} reativou usuário`;
		case "user.deleted":
			return `${actorName} deletou usuário`;
		case "user.password_reset_triggered":
			return `${actorName} enviou reset de senha`;
		case "user.session_revoked":
			return `${actorName} revogou sessão`;
		case "user.all_sessions_revoked":
			return `${actorName} revogou todas as sessões`;
		case "user.branch_linked":
			return `${actorName} vinculou filial`;
		case "user.branch_unlinked":
			return `${actorName} desvinculou filial`;
		default:
			return `${actorName} — ${action}`;
	}
}

export async function unlinkUserFromBranch(
	input: unknown
): Promise<ActionResult> {
	await requireCapabilityWithContext("users.update_branches", {});
	const actor = await requireCurrentSession();
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	// TODO: guard "último admin" — não implementado intencionalmente (simétrico ao gap em updateUser)
	await db
		.delete(userBranch)
		.where(
			and(
				eq(userBranch.userId, parsed.data.userId),
				eq(userBranch.branchId, parsed.data.branchId)
			)
		);

	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.branch_unlinked",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { branchId: parsed.data.branchId },
	});
	revalidatePath(`/dashboard/users/${parsed.data.userId}`);
	return { ok: true, data: undefined };
}
