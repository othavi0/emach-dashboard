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

export interface ActivityCursor extends CursorBase {
	createdAt: string;
	sort: "activity";
}

export interface ExpiringPromoCursor extends CursorBase {
	endsAt: string;
	sort: "expiringPromo";
}

export interface PromoCreatedAscCursor extends CursorBase {
	createdAt: string;
	sort: "promoCreatedAsc";
}

export interface PromoDiscountCursor extends CursorBase {
	discountValue: string;
	sort: "promoDiscountAsc" | "promoDiscountDesc";
}

export interface PromoEndsAtAscCursor extends CursorBase {
	endsAt: string | null;
	sort: "promoEndsAtAsc";
}

export interface CategoryTreeCursor extends CursorBase {
	sort: "categoryTree";
	sortOrder: number;
}

export interface PaidAtAscCursor extends CursorBase {
	paidAt: string;
	sort: "paidAtAsc";
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
	| PendingStockCursor
	| ActivityCursor
	| ExpiringPromoCursor
	| PromoCreatedAscCursor
	| PromoDiscountCursor
	| PromoEndsAtAscCursor
	| CategoryTreeCursor
	| PaidAtAscCursor;

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

/**
 * Decodifica um cursor e valida seu discriminante `sort`, estreitando o tipo.
 * Lança se o `sort` do cursor não for o esperado.
 */
export function decodeCursorAs<S extends Cursor["sort"]>(
	raw: string,
	sort: S
): Extract<Cursor, { sort: S }> {
	const parsed = decodeCursor(raw);
	if (parsed.sort !== sort) {
		throw new Error(`Cursor incompatível: esperado ${sort}`);
	}
	return parsed as Extract<Cursor, { sort: S }>;
}
