import { z } from "zod";

// O cursor chega do cliente (query string) em base64url: é parseado aqui,
// no boundary, e o resto do código confia no tipo que sai.
const cursorBase = { id: z.string(), v: z.literal(1) };

const newestCursorSchema = z.object({
	...cursorBase,
	createdAt: z.string(),
	sort: z.literal("newest"),
});

const nameCursorSchema = z.object({
	...cursorBase,
	name: z.string(),
	sort: z.literal("name"),
});

const stockHighCursorSchema = z.object({
	...cursorBase,
	sort: z.literal("stockHigh"),
	totalStock: z.number(),
});

const stockLowCursorSchema = z.object({
	...cursorBase,
	sort: z.literal("stockLow"),
	totalStock: z.number(),
});

const urgencyCursorSchema = z.object({
	...cursorBase,
	createdAt: z.string(),
	reorderCount: z.number(),
	sort: z.literal("urgency"),
	totalStock: z.number(),
});

const ltvCursorSchema = z.object({
	...cursorBase,
	ltv: z.number(),
	sort: z.literal("ltvDesc"),
});

const lastOrderCursorSchema = z.object({
	...cursorBase,
	lastOrderAt: z.string().nullable(),
	sort: z.literal("lastOrderDesc"),
});

const nameAscCursorSchema = z.object({
	...cursorBase,
	name: z.string(),
	sort: z.literal("nameAsc"),
});

const pendingStockCursorSchema = z.object({
	...cursorBase,
	quantity: z.number(),
	sort: z.literal("pendingStock"),
});

const activityCursorSchema = z.object({
	...cursorBase,
	createdAt: z.string(),
	sort: z.literal("activity"),
});

const expiringPromoCursorSchema = z.object({
	...cursorBase,
	endsAt: z.string(),
	sort: z.literal("expiringPromo"),
});

const promoCreatedAscCursorSchema = z.object({
	...cursorBase,
	createdAt: z.string(),
	sort: z.literal("promoCreatedAsc"),
});

const promoDiscountCursorSchema = z.object({
	...cursorBase,
	discountValue: z.string(),
	sort: z.enum(["promoDiscountAsc", "promoDiscountDesc"]),
});

const promoEndsAtAscCursorSchema = z.object({
	...cursorBase,
	endsAt: z.string().nullable(),
	sort: z.literal("promoEndsAtAsc"),
});

const categoryTreeCursorSchema = z.object({
	...cursorBase,
	sort: z.literal("categoryTree"),
	sortOrder: z.number(),
});

const paidAtAscCursorSchema = z.object({
	...cursorBase,
	paidAt: z.string(),
	sort: z.literal("paidAtAsc"),
});

const cursorSchema = z.discriminatedUnion("sort", [
	newestCursorSchema,
	nameCursorSchema,
	stockHighCursorSchema,
	stockLowCursorSchema,
	urgencyCursorSchema,
	ltvCursorSchema,
	lastOrderCursorSchema,
	nameAscCursorSchema,
	pendingStockCursorSchema,
	activityCursorSchema,
	expiringPromoCursorSchema,
	promoCreatedAscCursorSchema,
	promoDiscountCursorSchema,
	promoEndsAtAscCursorSchema,
	categoryTreeCursorSchema,
	paidAtAscCursorSchema,
]);

export type PaidAtAscCursor = z.infer<typeof paidAtAscCursorSchema>;

export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(c: Cursor): string {
	return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
	const parsed = cursorSchema.safeParse(
		JSON.parse(Buffer.from(raw, "base64url").toString())
	);

	if (!parsed.success) {
		throw new Error("Cursor incompatível");
	}

	return parsed.data;
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

	// SAFETY: o if acima garante parsed.sort === sort, e Cursor é união
	// discriminada por `sort`; o TS só não estreita porque S é genérico.
	return parsed as Extract<Cursor, { sort: S }>;
}
