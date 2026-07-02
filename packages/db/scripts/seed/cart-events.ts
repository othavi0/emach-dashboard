// packages/db/scripts/seed/cart-events.ts
import { cartEvent } from "../../src/schema/cart-events";
import type { SeedContext, Tx } from "./context";
import { pick, randInt, rng } from "./random";

const DAY_MS = 86_400_000;

// Eventos sintéticos de "adicionar ao carrinho": ~80% das tools com volume
// 3–45 espalhado nos últimos 100 dias (janelas 15/30/90 ganham valores
// distintos); ~20% ficam com 0 — zero também é estado a exibir.
export async function seedCartEvents(tx: Tx, ctx: SeedContext): Promise<void> {
	const rows: (typeof cartEvent.$inferInsert)[] = [];
	for (const toolId of ctx.toolIds) {
		if (rng() < 0.2) {
			continue;
		}
		const variants = ctx.variantIdsByTool[toolId] ?? [];
		const volume = randInt(3, 45);
		for (let i = 0; i < volume; i++) {
			rows.push({
				id: crypto.randomUUID(),
				toolId,
				variantId: variants.length > 0 ? pick(variants) : null,
				clientId:
					ctx.clientIds.length > 0 && rng() < 0.3 ? pick(ctx.clientIds) : null,
				sessionId: crypto.randomUUID(),
				quantity: randInt(1, 2),
				createdAt: new Date(
					Date.now() - randInt(0, 100) * DAY_MS - randInt(0, DAY_MS - 1)
				),
			});
		}
	}
	if (rows.length > 0) {
		await tx.insert(cartEvent).values(rows);
	}
}
