import "server-only";

import { db } from "@emach/db";
import { carrier, shippingBox } from "@emach/db/schema/shipping";
import { asc, desc, sql } from "drizzle-orm";

import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";

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

export interface CarrierBaseRow {
	active: boolean;
	cnpj: string | null;
	createdAt: Date;
	id: string;
	name: string;
}

export async function getCarriersPage({
	cursor,
}: {
	cursor: string | null;
}): Promise<InfiniteResult<CarrierBaseRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;

	const whereExpr =
		decoded && decoded.sort === "newest"
			? sql`(${carrier.createdAt}, ${carrier.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			: undefined;

	const rows = await db
		.select({
			id: carrier.id,
			name: carrier.name,
			cnpj: carrier.cnpj,
			active: carrier.active,
			createdAt: carrier.createdAt,
		})
		.from(carrier)
		.where(whereExpr)
		.orderBy(desc(carrier.createdAt), desc(carrier.id))
		.limit(BATCH_SIZE + 1);

	return paginate(
		rows,
		(r) => r,
		(last) => ({
			v: 1,
			sort: "newest" as const,
			createdAt: last.createdAt.toISOString(),
			id: last.id,
		})
	);
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
