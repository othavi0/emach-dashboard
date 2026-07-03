import "server-only";

import { db } from "@emach/db";
import { shippingBox } from "@emach/db/schema/shipping";
import { asc } from "drizzle-orm";

export interface ShippingBoxRow {
	active: boolean;
	id: string;
	internalHeightCm: string;
	internalLengthCm: string;
	internalWidthCm: string;
	maxWeightKg: string;
	name: string;
	tareWeightKg: string;
}

export async function getBoxes(): Promise<ShippingBoxRow[]> {
	const rows = await db
		.select()
		.from(shippingBox)
		.orderBy(asc(shippingBox.sortOrder), asc(shippingBox.name));
	return rows.map((b) => ({
		id: b.id,
		name: b.name,
		internalLengthCm: b.internalLengthCm,
		internalWidthCm: b.internalWidthCm,
		internalHeightCm: b.internalHeightCm,
		maxWeightKg: b.maxWeightKg,
		tareWeightKg: b.tareWeightKg,
		active: b.active,
	}));
}
