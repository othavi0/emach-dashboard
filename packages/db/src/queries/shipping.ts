import { asc, eq } from "drizzle-orm";

import { shippingBox } from "../schema/shipping";
import type { AnyDb } from "./catalog-helpers";
import type { QuoteBox } from "./shipping-quote";

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
