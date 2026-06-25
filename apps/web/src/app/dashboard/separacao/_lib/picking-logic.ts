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
