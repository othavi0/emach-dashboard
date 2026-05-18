// packages/db/scripts/seed/marketing.ts
import { promotion, promotionTool } from "../../src/schema/promotions";
import type { SeedContext, Tx } from "./context";

export async function seedMarketing(tx: Tx, ctx: SeedContext): Promise<void> {
	const now = new Date();
	const staffId = ctx.staffUserIds[0] as string;

	// --- promoções ---
	// p1: campanha ativa (tipo promotion, sem code)
	const p1Id = crypto.randomUUID();
	// p2: campanha futura (tipo promotion, sem code)
	const p2Id = crypto.randomUUID();
	// p3: cupom ativo (tipo promocode, com code)
	const p3Id = crypto.randomUUID();
	// p4: cupom expirado (tipo promocode, com code)
	const p4Id = crypto.randomUUID();

	const promos: (typeof promotion.$inferInsert)[] = [
		{
			id: p1Id,
			title: "Liquidação de Ferramentas Elétricas",
			description: "Desconto especial em ferramentas elétricas selecionadas.",
			type: "promotion",
			code: null,
			discountPct: "15.00",
			active: true,
			startsAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 dias atrás
			endsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // daqui 14 dias
			createdBy: staffId,
			updatedBy: staffId,
		},
		{
			id: p2Id,
			title: "Promoção Black Friday",
			description: "Prepare-se para o maior evento do ano.",
			type: "promotion",
			code: null,
			discountPct: "30.00",
			active: false,
			startsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // daqui 30 dias
			endsAt: new Date(now.getTime() + 33 * 24 * 60 * 60 * 1000), // daqui 33 dias
			createdBy: staffId,
			updatedBy: staffId,
		},
		{
			id: p3Id,
			title: "Cupom Boas-Vindas",
			description: "Cupom exclusivo para primeiros pedidos.",
			type: "promocode",
			code: "BEMVINDO10",
			discountPct: "10.00",
			active: true,
			startsAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 dias atrás
			endsAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // daqui 60 dias
			createdBy: staffId,
			updatedBy: staffId,
		},
		{
			id: p4Id,
			title: "Cupom Aniversário Maio",
			description: "Cupom comemorativo de aniversário — edição encerrada.",
			type: "promocode",
			code: "ANIV2025",
			discountPct: "20.00",
			active: false,
			startsAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 dias atrás
			endsAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 dias atrás (expirado)
			createdBy: staffId,
			updatedBy: staffId,
		},
	];

	await tx.insert(promotion).values(promos);

	// --- vínculos promotion_tool ---
	// Pegar até 4 toolIds disponíveis
	const tools = ctx.toolIds.slice(0, Math.min(ctx.toolIds.length, 11));

	const links: (typeof promotionTool.$inferInsert)[] = [];

	// p1 — até 4 tools (índices 0–3)
	for (const toolId of tools.slice(0, 4)) {
		links.push({ promotionId: p1Id, toolId });
	}

	// p2 — até 3 tools (índices 2–4, sobreposição intencional)
	for (const toolId of tools.slice(2, 5)) {
		links.push({ promotionId: p2Id, toolId });
	}

	// p3 — até 2 tools (índices 4–5)
	for (const toolId of tools.slice(4, 6)) {
		links.push({ promotionId: p3Id, toolId });
	}

	// p4 — 1 tool (índice 0)
	const firstTool = tools[0];
	if (firstTool !== undefined) {
		links.push({ promotionId: p4Id, toolId: firstTool });
	}

	if (links.length > 0) {
		await tx.insert(promotionTool).values(links);
	}
}
