import "server-only";

import { db } from "@emach/db";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { eq } from "drizzle-orm";
import { type Capability, isCapability } from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

// Overrides persistidos só podem ser grant/revoke (inherit = ausência de linha).
const PERSISTED_EFFECTS = [
	"grant",
	"revoke",
] as const satisfies readonly OverrideState[];

// A coluna é text: o enum do Drizzle só tipa, não impede valor legado no banco.
function parsePersistedEffect(value: string): OverrideState | undefined {
	return PERSISTED_EFFECTS.find((effect) => effect === value);
}

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
		const effect = parsePersistedEffect(r.effect);

		if (isCapability(r.capability) && effect) {
			map.set(r.capability, effect);
		}
	}

	return map;
}
