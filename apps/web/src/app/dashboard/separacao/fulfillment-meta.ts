import type { StatusIconKey } from "@/components/status-visual";
import type { FulfillmentState } from "./_lib/picking-logic";

// Fonte única visual do sub-estado de fulfillment (badge no detalhe, lista e fila).
export const FULFILLMENT_STATE_META: Record<
	FulfillmentState,
	{
		badgeVariant: "info" | "secondary" | "success" | "warning";
		iconKey: StatusIconKey;
		label: string;
	}
> = {
	awaiting_picking: {
		label: "A separar",
		iconKey: "clock",
		badgeVariant: "secondary",
	},
	picking_in_progress: {
		label: "Separando",
		iconKey: "package",
		badgeVariant: "info",
	},
	picking_exception: {
		label: "Exceção na separação",
		iconKey: "ban",
		badgeVariant: "warning",
	},
	picked: { label: "Separado", iconKey: "check", badgeVariant: "success" },
};

/**
 * Label do badge de card (spec 2026-07-11, mockup B): estado + responsável
 * da última sessão. "A separar" nunca tem nome (ninguém pegou o pedido);
 * exceção usa a forma curta pra não estourar o badge.
 */
export function fulfillmentBadgeLabel(
	state: FulfillmentState,
	pickerName: string | null | undefined
): string {
	const short =
		state === "picking_exception"
			? "Exceção"
			: FULFILLMENT_STATE_META[state].label;
	if (state === "awaiting_picking" || !pickerName) {
		return short;
	}
	return `${short} · ${pickerName}`;
}
