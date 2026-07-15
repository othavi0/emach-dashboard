import { z } from "zod";

const MAX_IDS = 100; // mesmo teto do bulkStartSeparationSchema (orders/schema.ts)

const idSchema = z.string().uuid();

export type PickingListParams =
	| { ids: string[]; mode: "ids" }
	| { mode: "tab"; tab: "a_separar" | "em_separacao" };

export type ResolveResult =
	| { ok: true; params: PickingListParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) e `?tab=` (recorte da fila) são mutuamente exclusivos. */
export function resolvePickingListParams(sp: URLSearchParams): ResolveResult {
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
		if (tabRaw !== "a_separar" && tabRaw !== "em_separacao") {
			return { error: "tab inválida", ok: false };
		}
		return { ok: true, params: { mode: "tab", tab: tabRaw } };
	}
	return { error: "Informe ids ou tab", ok: false };
}
