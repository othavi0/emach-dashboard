"use server";

import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { isCapability } from "@/lib/capabilities";
import { logger } from "@/lib/logger";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const AUDIT_ACTION = {
	grant: "permission.granted",
	revoke: "permission.revoked",
	inherit: "permission.reset",
} as const;

const inputSchema = z.object({
	targetUserId: z.string().min(1),
	capability: z.string().min(1),
	state: z.enum(["grant", "revoke", "inherit"]),
});

export async function setUserCapability(
	raw: z.infer<typeof inputSchema>
): Promise<ActionResult> {
	const parsed = inputSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}
	const { targetUserId, capability, state } = parsed.data;

	if (!isCapability(capability)) {
		return { ok: false, error: "Capability desconhecida" };
	}

	try {
		// Filiais do alvo entram no teto de branch-scope (admin só age na própria filial).
		const targetBranches = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, targetUserId));
		const targetBranchIds = targetBranches.map((b) => b.branchId);

		// Capability check (permissions.manage) + ensureActive + hierarquia
		// (admin não gerencia admin/super) + branch-scope do alvo. Lança se barrar.
		const actorSession = await requireCapabilityWithContext(
			"permissions.manage",
			{
				targetUserId,
				targetBranchIds,
			}
		);

		// Fail-closed: alvo sem filial não tem escopo a proteger e `assertBranchScope`
		// passa trivial — só super_admin pode gerenciá-lo (admin filial-scoped não).
		if (
			targetBranchIds.length === 0 &&
			actorSession.user.role !== "super_admin"
		) {
			return { ok: false, error: "Usuário alvo sem filial atribuída" };
		}

		// Anti-escalada: SÓ no grant. Apenas `grant` amplia acesso, então é o único
		// caminho que exige que o ator possua a capability. `revoke` e `inherit` só
		// reduzem ou resetam o acesso de um alvo que o ator já tem direito de
		// gerenciar (hierarquia + filial já validados acima) e nunca elevam acima do
		// teto do role do alvo — exigir posse aí só criaria um beco operacional
		// (admin não conseguiria limpar override perigoso sem um super_admin). Ver ADR-0017.
		if (state === "grant") {
			const actorCaps = await getUserCapabilities(actorSession);
			if (!actorCaps.has(capability)) {
				return {
					ok: false,
					error: "Você não pode conceder uma permissão que não possui",
				};
			}
		}

		// Estado anterior para a trilha de auditoria (antes da mutação).
		const [existing] = await db
			.select({ effect: userCapabilityOverride.effect })
			.from(userCapabilityOverride)
			.where(
				and(
					eq(userCapabilityOverride.userId, targetUserId),
					eq(userCapabilityOverride.capability, capability)
				)
			)
			.limit(1);
		const before = existing?.effect ?? "inherit";

		if (state === "inherit") {
			await db
				.delete(userCapabilityOverride)
				.where(
					and(
						eq(userCapabilityOverride.userId, targetUserId),
						eq(userCapabilityOverride.capability, capability)
					)
				);
		} else {
			await db
				.insert(userCapabilityOverride)
				.values({
					userId: targetUserId,
					capability,
					effect: state,
					grantedBy: actorSession.user.id,
				})
				.onConflictDoUpdate({
					target: [
						userCapabilityOverride.userId,
						userCapabilityOverride.capability,
					],
					set: {
						effect: state,
						grantedBy: actorSession.user.id,
						grantedAt: new Date(),
					},
				});
		}

		await logUserActivity({
			action: AUDIT_ACTION[state],
			actorUserId: actorSession.user.id,
			targetType: "user",
			targetId: targetUserId,
			metadata: { capability, effect: state, before },
		});

		revalidatePath(`/dashboard/users/${targetUserId}`);
		return { ok: true, data: undefined };
	} catch (err) {
		logger.error("setUserCapability", err);
		return { ok: false, error: "Não foi possível alterar a permissão" };
	}
}
