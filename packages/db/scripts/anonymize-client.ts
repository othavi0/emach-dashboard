import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src";
import {
	client,
	clientAccount,
	clientAddress,
	clientSession,
} from "../src/schema/client";
import { consentLog } from "../src/schema/consent-log";

async function main() {
	const id = process.argv[2];
	if (!id) {
		console.error("uso: bun run scripts/anonymize-client.ts <client-id>");
		process.exit(1);
	}

	await db.transaction(async (tx) => {
		const [existing] = await tx.select().from(client).where(eq(client.id, id));
		if (!existing) {
			throw new Error(`client ${id} não encontrado`);
		}

		const hash = crypto
			.createHash("sha256")
			.update(id)
			.digest("hex")
			.slice(0, 12);
		const anonEmail = `deleted-${hash}@anonymized.local`;

		await tx
			.update(client)
			.set({
				name: "[anonymized]",
				email: anonEmail,
				emailVerified: false,
				phone: null,
				document: null,
				image: null,
			})
			.where(eq(client.id, id));

		await tx.delete(clientAddress).where(eq(clientAddress.clientId, id));
		await tx.delete(clientSession).where(eq(clientSession.userId, id));
		await tx.delete(clientAccount).where(eq(clientAccount.userId, id));

		await tx.insert(consentLog).values({
			id: crypto.randomUUID(),
			actorType: "client",
			clientId: id,
			kind: "privacy",
			granted: false,
			version: `anonymization-${new Date().toISOString().slice(0, 10)}`,
		});
	});

	console.log(`[anonymize-client] OK id=${id}`);
}

main().catch((err) => {
	console.error("[anonymize-client] FAIL", err);
	process.exit(1);
});
