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

	await requireCapabilityWithContext("users.approve", {
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

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function rejectUser(input: {
	userId: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	await requireCapabilityWithContext("users.approve", {
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

	if (parsed.data.role) {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}
	if (parsed.data.branchIds) {
		await requireCapabilityWithContext("users.update_branches", {
			targetUserId: parsed.data.userId,
			targetBranchIds: parsed.data.branchIds,
		});
	}
	if (parsed.data.name) {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}

	try {
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
		return { ok: false, error: "Não foi possível atualizar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function suspendUser(input: {
	userId: string;
}): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	await requireCapabilityWithContext("users.suspend", {
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

	await requireCapabilityWithContext("users.suspend", {
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

	await requireCapabilityWithContext("users.delete", {
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

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
