"use server";

import { randomBytes } from "node:crypto";
import type { DashboardSession } from "@emach/auth/dashboard";
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
import { sendInviteEmail } from "@emach/email/send";
import { env } from "@emach/env/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { requireCapabilityWithContext } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

import { allowedApprovalRoles } from "./_lib/approval-roles";
import {
	acceptInviteSchema,
	branchLinkSchema,
	deleteUserSchema,
	type InviteUserInput,
	inviteIdSchema,
	inviteUserSchema,
	revokeSessionSchema,
	suspendUserSchema,
	triggerPasswordResetSchema,
	type UpdateUserInput,
	updateUserSchema,
	userIdSchema,
} from "./schema";

const USERS_PATH = "/dashboard/users";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function makeInviteToken(): { token: string; expiresAt: Date } {
	return {
		token: randomBytes(32).toString("base64url"),
		expiresAt: new Date(Date.now() + INVITE_TTL_MS),
	};
}

export async function inviteUser(
	input: InviteUserInput
): Promise<ActionResult> {
	const parsed = inviteUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetBranchIds: parsed.data.branchIds,
	});

	const actorRole = session.user.role as "super_admin" | "admin" | "user";
	if (!allowedApprovalRoles(actorRole).includes(parsed.data.role)) {
		return { ok: false, error: "Você não pode atribuir esse cargo" };
	}

	// Admin (não-super) só pode convidar role='user'
	if (actorRole !== "super_admin" && parsed.data.role !== "user") {
		return {
			ok: false,
			error: "Você só pode convidar usuários de nível 'user'",
		};
	}

	const { email, role, branchIds } = parsed.data;

	const [existing] = await db
		.select({ id: userTable.id, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);

	if (existing && existing.status !== "pending") {
		return { ok: false, error: "Já existe uma conta com esse email" };
	}

	const { token, expiresAt } = makeInviteToken();

	try {
		let userId: string;
		if (existing) {
			// Convite aberto pro mesmo email → regenera (reenvio implícito).
			userId = existing.id;
			await db
				.update(userTable)
				.set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
				.where(eq(userTable.id, userId));
		} else {
			const ctx = await authDashboard.$context;
			const created = await ctx.internalAdapter.createUser({
				email,
				name: "",
				emailVerified: true,
			});
			userId = created.id;
			await db
				.update(userTable)
				.set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
				.where(eq(userTable.id, userId));
		}

		// Revincula filiais (idempotente).
		await db.delete(userBranch).where(eq(userBranch.userId, userId));
		if (branchIds.length > 0) {
			await db
				.insert(userBranch)
				.values(branchIds.map((branchId) => ({ userId, branchId })));
		}

		await sendInviteEmail({
			to: email,
			inviterName: session.user.name,
			acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
		});

		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invited",
			targetType: "user",
			targetId: userId,
			metadata: { email, role, branchIds, resend: Boolean(existing) },
		});
	} catch (error) {
		logger.error("inviteUser falhou", error);
		return { ok: false, error: "Não foi possível enviar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function resendInvite(input: unknown): Promise<ActionResult> {
	const parsed = inviteIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({
			email: userTable.email,
			status: userTable.status,
		})
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target || target.status !== "pending") {
		return { ok: false, error: "Convite não encontrado" };
	}

	const { token, expiresAt } = makeInviteToken();

	try {
		await db
			.update(userTable)
			.set({ inviteToken: token, inviteTokenExpiresAt: expiresAt })
			.where(eq(userTable.id, parsed.data.userId));

		await sendInviteEmail({
			to: target.email,
			inviterName: session.user.name,
			acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
		});

		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invite_resent",
			targetType: "user",
			targetId: parsed.data.userId,
			metadata: { email: target.email },
		});
	} catch (error) {
		logger.error("resendInvite falhou", error);
		return { ok: false, error: "Não foi possível reenviar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function revokeInvite(input: unknown): Promise<ActionResult> {
	const parsed = inviteIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({ email: userTable.email, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target || target.status !== "pending") {
		return { ok: false, error: "Só convites pendentes podem ser revogados" };
	}

	try {
		await db.delete(userTable).where(eq(userTable.id, parsed.data.userId));
		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invite_revoked",
			targetType: "user",
			targetId: parsed.data.userId,
			metadata: { email: target.email },
		});
	} catch (error) {
		logger.error("revokeInvite falhou", error);
		return { ok: false, error: "Não foi possível revogar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function acceptInvite(input: unknown): Promise<ActionResult> {
	const parsed = acceptInviteSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const { getInviteByToken } = await import("./data");
	const invite = await getInviteByToken(parsed.data.token);
	if (!invite) {
		return { ok: false, error: "Convite inválido ou expirado" };
	}

	try {
		const ctx = await authDashboard.$context;
		await ctx.internalAdapter.createAccount({
			accountId: invite.userId,
			providerId: "credential",
			userId: invite.userId,
			password: await ctx.password.hash(parsed.data.password),
		});

		await db
			.update(userTable)
			.set({
				name: parsed.data.name,
				status: "active",
				inviteToken: null,
				inviteTokenExpiresAt: null,
			})
			.where(eq(userTable.id, invite.userId));

		await authDashboard.api.signInEmail({
			body: { email: invite.email, password: parsed.data.password },
			headers: await headers(),
		});

		await logUserActivity({
			actorUserId: invite.userId,
			action: "user.invite_accepted",
			targetType: "user",
			targetId: invite.userId,
		});
	} catch (error) {
		logger.error("acceptInvite falhou", error);
		return { ok: false, error: "Não foi possível concluir o cadastro" };
	}

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

	// Baseline obrigatório p/ qualquer campo (inclusive só emailVerified): users.manage
	// + active + hierarquia (admin não toca admin/super_admin). Fecha o bypass em que
	// um payload só-emailVerified passava sem nenhum gate.
	const session = await requireCapabilityWithContext("users.manage", {
		targetUserId: parsed.data.userId,
	});

	try {
		const [current] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, parsed.data.userId));
		if (!current) {
			return { ok: false, error: "Usuário não encontrado" };
		}

		const roleChanged =
			parsed.data.role !== undefined && parsed.data.role !== current.role;

		if (roleChanged) {
			await requireCapabilityWithContext("users.update_role", {
				targetUserId: parsed.data.userId,
			});
		}

		await db.transaction(async (tx) => {
			const update: {
				name?: string;
				role?: UpdateUserInput["role"];
				emailVerified?: boolean;
			} = {};
			if (parsed.data.name) {
				update.name = parsed.data.name;
			}
			if (parsed.data.role) {
				update.role = parsed.data.role;
			}
			if (parsed.data.emailVerified !== undefined) {
				update.emailVerified = parsed.data.emailVerified;
			}
			if (Object.keys(update).length > 0) {
				await tx
					.update(userTable)
					.set(update)
					.where(eq(userTable.id, parsed.data.userId));
			}
			if (roleChanged) {
				await tx
					.delete(sessionTable)
					.where(eq(sessionTable.userId, parsed.data.userId));
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
	if (parsed.data.emailVerified !== undefined) {
		changes.emailVerified = parsed.data.emailVerified;
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

export async function suspendUser(input: unknown): Promise<ActionResult> {
	const parsed = suspendUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	let session: DashboardSession;
	try {
		session = await requireCapabilityWithContext("users.suspend", {
			targetUserId: parsed.data.userId,
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : "Acesso negado";
		return { ok: false, error: message };
	}

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
		metadata: { reason: parsed.data.reason },
	});
	revalidatePath(USERS_PATH);
	revalidatePath(`${USERS_PATH}/${parsed.data.userId}`);
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
	revalidatePath(`${USERS_PATH}/${parsed.data.userId}`);
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

export async function deleteUser(input: unknown): Promise<ActionResult> {
	const parsed = deleteUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	let session: DashboardSession;
	try {
		session = await requireCapabilityWithContext("users.delete", {
			targetUserId: parsed.data.userId,
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : "Acesso negado";
		return { ok: false, error: message };
	}

	const [target] = await db
		.select({
			id: userTable.id,
			email: userTable.email,
			name: userTable.name,
		})
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) {
		return { ok: false, error: "User não encontrado" };
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
		metadata: {
			deletedEmail: target.email,
			deletedName: target.name,
			reason: parsed.data.reason,
		},
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
	if (target.userId === actor.user.id) {
		return {
			ok: false,
			error: "Não é possível revogar a própria sessão por aqui",
		};
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
	const actor = await requireCurrentSession();
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}
	try {
		await requireCapabilityWithContext("users.revoke_sessions", {
			targetUserId: parsed.data.userId,
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : "Acesso negado";
		return { ok: false, error: message };
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
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const actor = await requireCapabilityWithContext("users.update_branches", {
		targetUserId: parsed.data.userId,
		targetBranchIds: [parsed.data.branchId],
	});

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
	const session = await requireCapabilityWithContext("users.manage", {});
	const { getUserBranchScope } = await import("@/lib/branch-scope");
	const scope = await getUserBranchScope(session);
	const { fetchUsersPage } = await import("./data");
	return fetchUsersPage({ ...filters, cursor, scope });
}

export async function fetchPendingUsersAction(
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("@/components/pending-panel").PendingRow
	>
> {
	await requireCapabilityWithContext("users.approve", {});
	const { fetchPendingUsersPage } = await import("./data");
	return fetchPendingUsersPage(cursor);
}

export async function fetchUserActivityByUserPage(
	userId: string,
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<import("./data").UserActivityRow>
> {
	await requireCapabilityWithContext("users.manage", { targetUserId: userId });
	const { getUserActivity } = await import("./data");
	return getUserActivity(userId, cursor);
}

export async function fetchUserActivityAffectingPage(
	userId: string,
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("./data").UserActivityRow & { actorName: string | null }
	>
> {
	await requireCapabilityWithContext("users.manage", { targetUserId: userId });
	const { getUserAffectedActivity } = await import("./data");
	return getUserAffectedActivity(userId, cursor);
}

export async function fetchUserActivityFeedPage(
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("@/components/activity-feed").ActivityEvent
	>
> {
	await requireCapabilityWithContext("users.manage", {});
	const { getUserActivityFeedPaginated } = await import("./data");
	const page = await getUserActivityFeedPaginated(cursor);
	return {
		items: page.items.map((a) => ({
			id: a.id,
			kind: "user" as const,
			primary: humanizeActivityAction(a.action, a.actorName ?? "—"),
			at: a.createdAt,
			href: a.targetId ? `/dashboard/users/${a.targetId}` : undefined,
		})),
		nextCursor: page.nextCursor,
	};
}

function humanizeActivityAction(action: string, actorName: string): string {
	switch (action) {
		case "user.invited":
			return `${actorName} convidou usuário`;
		case "user.invite_resent":
			return `${actorName} reenviou convite`;
		case "user.invite_revoked":
			return `${actorName} revogou convite`;
		case "user.invite_accepted":
			return `${actorName} aceitou convite`;
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
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const actor = await requireCapabilityWithContext("users.update_branches", {
		targetUserId: parsed.data.userId,
		targetBranchIds: [parsed.data.branchId],
	});

	const { userId: targetUserId, branchId } = parsed.data;

	// Last-branch guard: admin/user precisam de ≥1 filial
	const [targetUser] = await db
		.select({ role: userTable.role })
		.from(userTable)
		.where(eq(userTable.id, targetUserId))
		.limit(1);
	const [remaining] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(
			and(
				eq(userBranch.userId, targetUserId),
				ne(userBranch.branchId, branchId)
			)
		);
	if (
		targetUser &&
		targetUser.role !== "super_admin" &&
		(remaining?.n ?? 0) < 1
	) {
		return { ok: false, error: "Usuário precisa de ao menos 1 filial" };
	}

	await db
		.delete(userBranch)
		.where(
			and(
				eq(userBranch.userId, targetUserId),
				eq(userBranch.branchId, branchId)
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
