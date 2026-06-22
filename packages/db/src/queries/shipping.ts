import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
	carrier,
	carrierRate,
	type carrierRateRelations,
	type carrierRelations,
	carrierZone,
	type carrierZoneRelations,
	shippingBox,
} from "../schema/shipping";
import type { QuoteBox, QuoteCarrier } from "./shipping-quote";

// Schema subset mínimo p/ o db.query relational funcionar tipado.
// `extends Record<string, unknown>` dá a index-signature exigida pelo
// constraint de NodePgDatabase (interface pura não satisfaz Record<string,unknown>).
interface ShippingSchema extends Record<string, unknown> {
	carrier: typeof carrier;
	carrierRate: typeof carrierRate;
	carrierRateRelations: typeof carrierRateRelations;
	carrierRelations: typeof carrierRelations;
	carrierZone: typeof carrierZone;
	carrierZoneRelations: typeof carrierZoneRelations;
}

type AnyDb = NodePgDatabase<Record<string, unknown>>;
type ShippingDb = NodePgDatabase<ShippingSchema>;

// Coerce numeric (string US do Postgres) → number; null preservado.
function num(v: string | null): number | null {
	return v === null ? null : Number(v);
}

export async function getActiveCarriersWithTables(
	db: AnyDb
): Promise<QuoteCarrier[]> {
	const rows = await (db as ShippingDb).query.carrier.findMany({
		where: eq(carrier.active, true),
		with: {
			zones: { orderBy: [asc(carrierZone.sortOrder)] },
			rates: { orderBy: [asc(carrierRate.weightFromKg)] },
		},
	});

	return rows.map((c) => ({
		id: c.id,
		name: c.name,
		cubageDivisor: c.cubageDivisor,
		grisPercent: num(c.grisPercent),
		grisMinAmount: num(c.grisMinAmount),
		advaloremPercent: num(c.advaloremPercent),
		tollAmount: num(c.tollAmount),
		icmsPercent: num(c.icmsPercent),
		zones: c.zones.map((z) => ({
			cepRanges: z.cepRanges.map((r) => ({ from: r.from, to: r.to })),
			deliveryDays: z.deliveryDays,
			minFreightAmount: num(z.minFreightAmount),
			rates: c.rates
				.filter((r) => r.zoneId === z.id)
				.map((r) => ({
					weightFromKg: Number(r.weightFromKg),
					weightToKg: num(r.weightToKg),
					baseAmount: Number(r.baseAmount),
					perKgAmount: Number(r.perKgAmount),
				})),
		})),
	}));
}

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
