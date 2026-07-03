import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { shippingBox } from "../schema/shipping";
import type { QuoteBox } from "./shipping-quote";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

export async function getActiveBoxes(db: AnyDb): Promise<QuoteBox[]> {
	const rows = await db
		.select()
		.from(shippingBox)
		.where(eq(shippingBox.active, true))
		.orderBy(asc(shippingBox.sortOrder));

	return rows.map((b) => ({
		id: b.id,
		internalLengthCm: Number(b.internalLengthCm),
		internalWidthCm: Number(b.internalWidthCm),
		internalHeightCm: Number(b.internalHeightCm),
		maxWeightKg: Number(b.maxWeightKg),
		tareWeightKg: Number(b.tareWeightKg),
	}));
}
