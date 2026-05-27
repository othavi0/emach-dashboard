import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userActivityLog } from "@emach/db/schema/user-activity";
import { eq } from "drizzle-orm";

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
	let actorName: string | null = null;
	try {
		const [actor] = await db
			.select({ name: userTable.name })
			.from(userTable)
			.where(eq(userTable.id, input.actorUserId))
			.limit(1);
		actorName = actor?.name ?? null;
	} catch (err) {
		logger.error("logUserActivity actorName lookup", err);
	}

	const metadata = {
		...(input.metadata ?? {}),
		actorName,
	};

	try {
		await db.insert(userActivityLog).values({
			id: crypto.randomUUID(),
			actorUserId: input.actorUserId,
			action: input.action,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
			metadata,
		});
	} catch (err) {
		logger.error("logUserActivity", err);
	}
}
