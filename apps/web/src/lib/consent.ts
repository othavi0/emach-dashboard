import crypto from "node:crypto";
import { db } from "@emach/db";
import { type ConsentKind, consentLog } from "@emach/db/schema/consent-log";
import { and, desc, eq, isNull } from "drizzle-orm";

interface ConsentInput {
	actorType: "client" | "lead";
	clientId?: string;
	granted: boolean;
	kind: ConsentKind;
	leadId?: string;
	request: Request;
	version: string;
}

export async function logConsent(input: ConsentInput): Promise<void> {
	const ipAddress =
		input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
	const userAgent = input.request.headers.get("user-agent") ?? null;

	await db.insert(consentLog).values({
		id: crypto.randomUUID(),
		actorType: input.actorType,
		clientId: input.clientId,
		leadId: input.leadId,
		kind: input.kind,
		granted: input.granted,
		version: input.version,
		ipAddress,
		userAgent,
	});
}

export async function revokeConsent(args: {
	clientId: string;
	kind: ConsentKind;
}): Promise<void> {
	const [latest] = await db
		.select()
		.from(consentLog)
		.where(
			and(
				eq(consentLog.clientId, args.clientId),
				eq(consentLog.kind, args.kind),
				eq(consentLog.granted, true),
				isNull(consentLog.revokedAt)
			)
		)
		.orderBy(desc(consentLog.grantedAt))
		.limit(1);

	if (!latest) {
		return;
	}
	await db
		.update(consentLog)
		.set({ revokedAt: new Date() })
		.where(eq(consentLog.id, latest.id));
}

export async function getActiveConsent(
	clientId: string,
	kind: ConsentKind
): Promise<boolean> {
	const [row] = await db
		.select()
		.from(consentLog)
		.where(
			and(
				eq(consentLog.clientId, clientId),
				eq(consentLog.kind, kind),
				eq(consentLog.granted, true),
				isNull(consentLog.revokedAt)
			)
		)
		.orderBy(desc(consentLog.grantedAt))
		.limit(1);

	return Boolean(row);
}
