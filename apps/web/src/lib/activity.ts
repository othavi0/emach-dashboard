import "server-only";

import { db } from "@emach/db";
import { userActivityLog } from "@emach/db/schema/user-activity";

import { logger } from "./logger";

export interface LogUserActivityInput {
	action: string;
	actorUserId: string;
	metadata?: Record<string, unknown>;
	targetId?: string;
	targetType?: string;
}

export async function logUserActivity(
	input: LogUserActivityInput
): Promise<void> {
	try {
		await db.insert(userActivityLog).values({
			id: crypto.randomUUID(),
			actorUserId: input.actorUserId,
			action: input.action,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
			metadata: input.metadata ?? null,
		});
	} catch (err) {
		logger.error("logUserActivity", err);
	}
}
