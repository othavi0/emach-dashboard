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
		label: "Aguardando separação",
		iconKey: "clock",
		badgeVariant: "secondary",
	},
	picking_in_progress: {
		label: "Em separação",
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
