import "server-only";

import { db } from "@emach/db";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { eq } from "drizzle-orm";
import type { Capability } from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

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
		map.set(r.capability as Capability, r.effect as OverrideState);
	}
	return map;
}
