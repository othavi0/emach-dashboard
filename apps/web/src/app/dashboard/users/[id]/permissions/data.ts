import "server-only";

import { db } from "@emach/db";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { eq } from "drizzle-orm";
import { type Capability, isCapability } from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

// Overrides persistidos só podem ser grant/revoke (inherit = ausência de linha).
const PERSISTED_EFFECTS = new Set(["grant", "revoke"]);

export async function getUserOverrides(
	userId: string
): Promise<Map<Capability, OverrideState>> {
	const rows = await db
		.select({
			capability: userCapabilityOverride.capability,
			effect: userCapabilityOverride.effect,
		})
		.from(userCapabilityOverride)
		.where(eq(userCapabilityOverride.userId, userId));
	const map = new Map<Capability, OverrideState>();
	for (const r of rows) {
		// Ignora linhas com cap fora do registry ou effect inesperado (fail-closed:
		// dado legado/inválido não vira um override fantasma na UI).
		if (isCapability(r.capability) && PERSISTED_EFFECTS.has(r.effect)) {
			map.set(r.capability, r.effect as OverrideState);
		}
	}
	return map;
}
