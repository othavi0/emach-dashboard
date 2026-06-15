"use server";

import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logUserActivity } from "@/lib/activity";
import { isCapability } from "@/lib/capabilities";
import { logger } from "@/lib/logger";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

// ActionResult canônico vive em users/actions.ts; reexportamos o tipo localmente
// para não criar dependência circular via import de server action de outro módulo.
export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

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

		// Anti-escalada: ator só togla capabilities que ele próprio possui (efetivo).
		// Aplica para grant E revoke — impede revogar cap que o ator nunca teria
		// como re-conceder (evita uso de revoke como vetor de escalada indireta).
		const actorCaps = await getUserCapabilities(actorSession);
		if (!actorCaps.has(capability)) {
			return {
				ok: false,
				error: "Você não pode gerenciar uma permissão que não possui",
			};
		}

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
			metadata: { capability, effect: state },
		});

		revalidatePath(`/dashboard/users/${targetUserId}`);
		return { ok: true, data: undefined };
	} catch (err) {
		logger.error("setUserCapability", err);
		return { ok: false, error: "Não foi possível alterar a permissão" };
	}
}
