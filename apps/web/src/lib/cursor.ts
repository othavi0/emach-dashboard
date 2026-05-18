interface CursorBase {
	id: string;
	v: 1;
}

export interface NewestCursor extends CursorBase {
	createdAt: string;
	sort: "newest";
}

export interface NameCursor extends CursorBase {
	name: string;
	sort: "name";
}

export interface StockHighCursor extends CursorBase {
	sort: "stockHigh";
	totalStock: number;
}

export interface StockLowCursor extends CursorBase {
	sort: "stockLow";
	totalStock: number;
}

export interface UrgencyCursor extends CursorBase {
	createdAt: string;
	reorderCount: number;
	sort: "urgency";
	totalStock: number;
}

export interface LtvCursor extends CursorBase {
	ltv: number;
	sort: "ltvDesc";
}

export interface LastOrderCursor extends CursorBase {
	lastOrderAt: string | null;
	sort: "lastOrderDesc";
}

export interface NameAscCursor extends CursorBase {
	name: string;
	sort: "nameAsc";
}

export interface PendingStockCursor extends CursorBase {
	quantity: number;
	sort: "pendingStock";
}

export type Cursor =
	| NewestCursor
	| NameCursor
	| StockHighCursor
	| StockLowCursor
	| UrgencyCursor
	| LtvCursor
	| LastOrderCursor
	| NameAscCursor
	| PendingStockCursor;

export function encodeCursor(c: Cursor): string {
	return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
	const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
	if (parsed.v !== 1) {
		throw new Error("Cursor incompatível");
	}
	return parsed;
}
