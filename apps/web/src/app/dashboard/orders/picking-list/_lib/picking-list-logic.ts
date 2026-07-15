import { formatDayTime } from "@/lib/format/datetime";

export interface PickingListItem {
	barcode: string | null;
	model: string | null;
	name: string;
	quantity: number;
	sku: string | null;
	variantId: string | null;
	voltage: string | null;
}

export interface PickingListOrder {
	city: string | null;
	clientName: string;
	id: string;
	items: PickingListItem[];
	number: string;
	shippingMethod: string | null;
	state: string | null;
}

export interface CollectLine {
	barcode: string | null;
	model: string | null;
	name: string;
	orderCount: number;
	sku: string | null;
	totalQty: number;
	voltage: string | null;
}

export interface CarrierGroup {
	carrier: string | null;
	label: string;
	orders: PickingListOrder[];
}

export interface PickingListStats {
	carriers: number;
	orders: number;
	skus: number;
	units: number;
}

export const NO_CARRIER_LABEL = "Sem transportadora definida";

function lineKey(item: PickingListItem): string {
	return item.variantId ?? item.sku ?? item.name;
}

/** Coleta consolidada: itens iguais somados, uma passada no estoque (spec, decisão 4). */
export function consolidateItems(orders: PickingListOrder[]): CollectLine[] {
	const byKey = new Map<string, CollectLine & { orderIds: Set<string> }>();
	for (const o of orders) {
		for (const item of o.items) {
			const key = lineKey(item);
			const existing = byKey.get(key);
			if (existing) {
				existing.totalQty += item.quantity;
				existing.orderIds.add(o.id);
			} else {
				byKey.set(key, {
					barcode: item.barcode,
					model: item.model,
					name: item.name,
					orderCount: 0,
					orderIds: new Set([o.id]),
					sku: item.sku,
					totalQty: item.quantity,
					voltage: item.voltage,
				});
			}
		}
	}
	return Array.from(byKey.values())
		.map(({ orderIds, ...line }) => ({ ...line, orderCount: orderIds.size }))
		.sort(
			(a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name, "pt-BR")
		);
}

/** Conferência agrupada por transportadora; sem transportadora vai pro fim (spec §edge cases). */
export function groupByCarrier(orders: PickingListOrder[]): CarrierGroup[] {
	const byCarrier = new Map<string | null, PickingListOrder[]>();
	for (const o of orders) {
		const key = o.shippingMethod;
		const group = byCarrier.get(key);
		if (group) {
			group.push(o);
		} else {
			byCarrier.set(key, [o]);
		}
	}
	const groups: CarrierGroup[] = Array.from(byCarrier.entries()).map(
		([carrier, groupOrders]) => ({
			carrier,
			label: carrier ?? NO_CARRIER_LABEL,
			orders: [...groupOrders].sort((a, b) =>
				a.number.localeCompare(b.number, "pt-BR")
			),
		})
	);
	return groups.sort((a, b) => {
		if (a.carrier === null) {
			return 1;
		}
		if (b.carrier === null) {
			return -1;
		}
		return a.label.localeCompare(b.label, "pt-BR");
	});
}

/** Documento adaptativo (decisão 6): coleta só agrega valor com 2+ pedidos. */
export function shouldIncludeCollect(orders: PickingListOrder[]): boolean {
	return orders.length >= 2;
}

export function pickingListStats(orders: PickingListOrder[]): PickingListStats {
	const skus = new Set<string>();
	const carriers = new Set<string | null>();
	let units = 0;
	for (const o of orders) {
		carriers.add(o.shippingMethod);
		for (const item of o.items) {
			units += item.quantity;
			skus.add(lineKey(item));
		}
	}
	return {
		carriers: carriers.size,
		orders: orders.length,
		skus: skus.size,
		units,
	};
}

/** Identificador efêmero de lote (decisão 11): distingue folhas no galpão sem persistir entidade. */
export function batchLabel(now: Date): string {
	// formatDayTime devolve "dd/MM, HH:mm" (fuso America/Sao_Paulo) — extrai só
	// os dígitos pra não depender do separador exato (vírgula/espaço/etc).
	const digits = formatDayTime(now).replace(/\D/g, "");
	return `L-${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
}
