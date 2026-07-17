import type { OrderPickingStatus } from "@emach/db/schema/orders";

export interface PickItem {
	barcode: string | null;
	id: string;
	notFound: boolean;
	qtyExpected: number;
	qtyPicked: number;
	variantId: string | null;
}

export function matchPickItem(
	items: PickItem[],
	code: string,
	variantIdFromBarcode: string | null
): { item: PickItem } | { error: "not_in_order" } {
	const bySnapshot = items.find(
		(it) => it.barcode !== null && it.barcode === code
	);
	if (bySnapshot) {
		return { item: bySnapshot };
	}
	if (variantIdFromBarcode) {
		const byVariant = items.find((it) => it.variantId === variantIdFromBarcode);
		if (byVariant) {
			return { item: byVariant };
		}
	}
	return { error: "not_in_order" };
}

export function canScanMore(item: PickItem): boolean {
	return !item.notFound && item.qtyPicked < item.qtyExpected;
}

export function isPickingComplete(items: PickItem[]): boolean {
	return items.every((it) => !it.notFound && it.qtyPicked === it.qtyExpected);
}

/**
 * Finalizável quando todo item está resolvido: bipado por completo OU marcado
 * como ausente (notFound). Diferente de isPickingComplete, permite finalizar uma
 * sessão com pendências — que vira status 'exception' (ver completePicking).
 */
export function canFinalizePicking(items: PickItem[]): boolean {
	return (
		items.length > 0 &&
		items.every((it) => it.notFound || it.qtyPicked === it.qtyExpected)
	);
}

export function summarizePicking(items: PickItem[]): {
	totalUnits: number;
	pickedUnits: number;
	exceptions: number;
} {
	return items.reduce(
		(acc, it) => ({
			totalUnits: acc.totalUnits + it.qtyExpected,
			pickedUnits: acc.pickedUnits + it.qtyPicked,
			exceptions: acc.exceptions + (it.notFound ? 1 : 0),
		}),
		{ totalUnits: 0, pickedUnits: 0, exceptions: 0 }
	);
}

// ─── Sub-estado de fulfillment (derivado da ÚLTIMA sessão de picking) ────────
// order.status fica intocado (contrato ecommerce); o dashboard deriva o estado
// operacional da separação da sessão mais recente. Spec 2026-07-06.

export type FulfillmentState =
	| "awaiting_picking"
	| "picking_in_progress"
	| "picking_exception"
	| "picked";

export function deriveFulfillmentState(
	latestStatus: OrderPickingStatus | null
): FulfillmentState {
	if (latestStatus === "in_progress") {
		return "picking_in_progress";
	}
	if (latestStatus === "exception") {
		return "picking_exception";
	}
	if (latestStatus === "completed") {
		return "picked";
	}
	// null (nenhuma sessão) ou canceled → volta pra fila de separação
	return "awaiting_picking";
}

/** Sessão sem bipagem há mais de 1h é destacada como parada (só alerta). */
export const STALE_PICKING_MS = 60 * 60 * 1000;

export function isPickingStale(args: {
	lastScannedAt: Date | null;
	now?: Date;
	startedAt: Date;
}): boolean {
	const reference = args.lastScannedAt ?? args.startedAt;
	const now = args.now ?? new Date();
	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
}

// ─── Elegibilidade do claim em lote (D12, spec 2026-07-16) ──────────────────
// Espelha bulkStartSeparationSkipReason (orders/_lib/bulk-eligibility.ts):
// puro e testável, fora do "use server", chamado por bulkStartPicking sem
// duplicar a régua individual de startPicking (paid/preparing + branchId).

export type BulkPickingSkipReason = "sem_filial" | "status_diferente";

export function bulkStartPickingSkipReason(locked: {
	branchId: string | null;
	status: string;
}): BulkPickingSkipReason | null {
	if (locked.status !== "paid" && locked.status !== "preparing") {
		return "status_diferente";
	}
	if (!locked.branchId) {
		return "sem_filial";
	}
	return null;
}

export const BULK_PICKING_SKIP_LABEL: Record<BulkPickingSkipReason, string> = {
	sem_filial: "sem filial",
	status_diferente: "não está mais na fila",
};
