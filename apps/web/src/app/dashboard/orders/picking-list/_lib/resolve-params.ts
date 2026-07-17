import { z } from "zod";

const MAX_IDS = 100; // mesmo teto do bulkStartSeparationSchema (orders/schema.ts)

const idSchema = z.string().uuid();

export interface PickingListParams {
	ids: string[];
}

export type ResolveResult =
	| { ok: true; params: PickingListParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) é o único modo suportado pela rota. */
export function resolvePickingListParams(sp: URLSearchParams): ResolveResult {
	const idsRaw = sp.get("ids");
	if (!idsRaw) {
		return { error: "Informe ids", ok: false };
	}
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
	return { ok: true, params: { ids } };
}
