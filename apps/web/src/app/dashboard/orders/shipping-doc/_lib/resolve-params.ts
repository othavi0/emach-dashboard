import { z } from "zod";

const MAX_IDS = 100; // mesmo teto da picking-list (orders/schema.ts bulk)

const idSchema = z.string().uuid();

// A única tab que gera documento de envio é "Pronto para enviar" (picked):
// pedido preparing com a última sessão de picking concluída.
export type ShippingDocParams =
	| { ids: string[]; mode: "ids" }
	| { mode: "tab"; tab: "picked" };

export type ResolveResult =
	| { ok: true; params: ShippingDocParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) e `?tab=picked` (recorte da tab) são mutuamente exclusivos. */
export function resolveShippingDocParams(sp: URLSearchParams): ResolveResult {
	const idsRaw = sp.get("ids");
	const tabRaw = sp.get("tab");

	if (idsRaw && tabRaw) {
		return { error: "Use ids OU tab, não ambos", ok: false };
	}
	if (idsRaw) {
		const ids = Array.from(
			new Set(
				idsRaw
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			)
		);
		if (ids.length === 0 || ids.length > MAX_IDS) {
			return { error: `ids deve ter entre 1 e ${MAX_IDS} itens`, ok: false };
		}
		if (!ids.every((id) => idSchema.safeParse(id).success)) {
			return { error: "ids contém valor inválido", ok: false };
		}
		return { ok: true, params: { ids, mode: "ids" } };
	}
	if (tabRaw) {
		if (tabRaw !== "picked") {
			return { error: "tab inválida", ok: false };
		}
		return { ok: true, params: { mode: "tab", tab: "picked" } };
	}
	return { error: "Informe ids ou tab", ok: false };
}
