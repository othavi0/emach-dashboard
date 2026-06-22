import "server-only";

import { db } from "@emach/db";
import {
	carrier,
	carrierRate,
	carrierZone,
	shippingBox,
} from "@emach/db/schema/shipping";
import { tool } from "@emach/db/schema/tools";
import { asc, desc, eq, sql } from "drizzle-orm";

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

export interface CarrierDetail {
	active: boolean;
	advaloremPercent: string | null;
	cnpj: string | null;
	cubageDivisor: number;
	grisMinAmount: string | null;
	grisPercent: string | null;
	icmsPercent: string | null;
	id: string;
	name: string;
	notes: string | null;
	tollAmount: string | null;
}

export async function getCarrierDetail(
	id: string
): Promise<CarrierDetail | null> {
	const [row] = await db
		.select()
		.from(carrier)
		.where(eq(carrier.id, id))
		.limit(1);
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		name: row.name,
		cnpj: row.cnpj,
		active: row.active,
		cubageDivisor: row.cubageDivisor,
		grisPercent: row.grisPercent,
		grisMinAmount: row.grisMinAmount,
		advaloremPercent: row.advaloremPercent,
		tollAmount: row.tollAmount,
		icmsPercent: row.icmsPercent,
		notes: row.notes,
	};
}

export interface ZoneWithRates {
	cepRanges: { from: string; to: string; label?: string }[];
	deliveryDays: number | null;
	id: string;
	minFreightAmount: string | null;
	name: string;
	rates: {
		id: string;
		weightFromKg: string;
		weightToKg: string | null;
		baseAmount: string;
		perKgAmount: string;
	}[];
}

export interface ToolForQuote {
	heightCm: string;
	id: string;
	lengthCm: string;
	name: string;
	packagingWeightKg: string;
	shipsInOwnBox: boolean;
	stackable: boolean;
	weightKg: string;
	widthCm: string;
}

export async function getToolsForQuote(): Promise<ToolForQuote[]> {
	const rows = await db
		.select({
			id: tool.id,
			name: tool.name,
			weightKg: tool.weightKg,
			lengthCm: tool.lengthCm,
			widthCm: tool.widthCm,
			heightCm: tool.heightCm,
			packagingWeightKg: tool.packagingWeightKg,
			stackable: tool.stackable,
			shipsInOwnBox: tool.shipsInOwnBox,
		})
		.from(tool)
		.where(eq(tool.status, "active"))
		.orderBy(asc(tool.name));
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		weightKg: r.weightKg,
		lengthCm: r.lengthCm,
		widthCm: r.widthCm,
		heightCm: r.heightCm,
		packagingWeightKg: r.packagingWeightKg,
		stackable: r.stackable,
		shipsInOwnBox: r.shipsInOwnBox,
	}));
}

export async function getCarrierZones(
	carrierId: string
): Promise<ZoneWithRates[]> {
	const zones = await db
		.select()
		.from(carrierZone)
		.where(eq(carrierZone.carrierId, carrierId))
		.orderBy(asc(carrierZone.sortOrder), asc(carrierZone.name));
	const rates = await db
		.select()
		.from(carrierRate)
		.where(eq(carrierRate.carrierId, carrierId))
		.orderBy(asc(carrierRate.weightFromKg));
	return zones.map((z) => ({
		id: z.id,
		name: z.name,
		cepRanges: z.cepRanges as { from: string; to: string; label?: string }[],
		deliveryDays: z.deliveryDays,
		minFreightAmount: z.minFreightAmount,
		rates: rates
			.filter((r) => r.zoneId === z.id)
			.map((r) => ({
				id: r.id,
				weightFromKg: r.weightFromKg,
				weightToKg: r.weightToKg,
				baseAmount: r.baseAmount,
				perKgAmount: r.perKgAmount,
			})),
	}));
}
