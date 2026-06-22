// packages/db/scripts/seed/shipping.ts
import {
	carrier,
	carrierRate,
	carrierZone,
	shippingBox,
} from "@emach/db/schema/shipping";
import type { Tx } from "./context";

// ---------------------------------------------------------------------------
// Catálogo de caixas (S / M / L / XL)
// ---------------------------------------------------------------------------

interface BoxDef {
	internalHeightCm: string;
	internalLengthCm: string;
	internalWidthCm: string;
	maxWeightKg: string;
	name: string;
	sortOrder: number;
	tareWeightKg: string;
}

const BOXES: BoxDef[] = [
	{
		name: "Caixa S",
		internalLengthCm: "35.00",
		internalWidthCm: "35.00",
		internalHeightCm: "30.00",
		maxWeightKg: "20.000",
		tareWeightKg: "0.500",
		sortOrder: 0,
	},
	{
		name: "Caixa M",
		internalLengthCm: "50.00",
		internalWidthCm: "50.00",
		internalHeightCm: "40.00",
		maxWeightKg: "35.000",
		tareWeightKg: "0.800",
		sortOrder: 1,
	},
	{
		name: "Caixa L",
		internalLengthCm: "70.00",
		internalWidthCm: "60.00",
		internalHeightCm: "50.00",
		maxWeightKg: "60.000",
		tareWeightKg: "1.200",
		sortOrder: 2,
	},
	{
		name: "Caixa XL",
		internalLengthCm: "90.00",
		internalWidthCm: "70.00",
		internalHeightCm: "60.00",
		maxWeightKg: "80.000",
		tareWeightKg: "1.800",
		sortOrder: 3,
	},
];

// ---------------------------------------------------------------------------
// Transportadora Exemplo — 1 carrier, 2 zones, 2-3 rate brackets each
// ---------------------------------------------------------------------------

export async function seedShipping(tx: Tx): Promise<void> {
	// --- 1. Caixas ---
	for (const box of BOXES) {
		await tx.insert(shippingBox).values({
			id: crypto.randomUUID(),
			name: box.name,
			internalLengthCm: box.internalLengthCm,
			internalWidthCm: box.internalWidthCm,
			internalHeightCm: box.internalHeightCm,
			maxWeightKg: box.maxWeightKg,
			tareWeightKg: box.tareWeightKg,
			active: true,
			sortOrder: box.sortOrder,
		});
	}

	// --- 2. Transportadora Exemplo ---
	const carrierId = crypto.randomUUID();
	await tx.insert(carrier).values({
		id: carrierId,
		name: "Transportadora Exemplo",
		cnpj: null,
		active: true,
		cubageDivisor: 6000,
		grisPercent: "0.30",
		grisMinAmount: null,
		advaloremPercent: null,
		tollAmount: null,
		icmsPercent: null,
		notes: "Transportadora de demonstração — dados fictícios.",
	});

	// --- 3. Zona 1: Curitiba e RMC ---
	const zoneRmcId = crypto.randomUUID();
	await tx.insert(carrierZone).values({
		id: zoneRmcId,
		carrierId,
		name: "Curitiba e RMC",
		cepRanges: [{ from: "80000000", to: "82999999", label: "Curitiba e RMC" }],
		deliveryDays: 3,
		minFreightAmount: "20.00",
		sortOrder: 0,
	});

	// Faixas de peso — Curitiba e RMC
	// 0–5 kg
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneRmcId,
		weightFromKg: "0.000",
		weightToKg: "5.000",
		baseAmount: "15.00",
		perKgAmount: "0.00",
	});
	// 5–30 kg
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneRmcId,
		weightFromKg: "5.000",
		weightToKg: "30.000",
		baseAmount: "20.00",
		perKgAmount: "1.20",
	});
	// 30 kg+ (topo — weightToKg NULL = ∞)
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneRmcId,
		weightFromKg: "30.000",
		weightToKg: null,
		baseAmount: "50.00",
		perKgAmount: "0.90",
	});

	// --- 4. Zona 2: Brasil ---
	const zoneBrId = crypto.randomUUID();
	await tx.insert(carrierZone).values({
		id: zoneBrId,
		carrierId,
		name: "Brasil",
		cepRanges: [{ from: "00000000", to: "99999999", label: "Brasil" }],
		deliveryDays: 10,
		minFreightAmount: "35.00",
		sortOrder: 1,
	});

	// Faixas de peso — Brasil
	// 0–5 kg
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneBrId,
		weightFromKg: "0.000",
		weightToKg: "5.000",
		baseAmount: "30.00",
		perKgAmount: "0.00",
	});
	// 5–30 kg
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneBrId,
		weightFromKg: "5.000",
		weightToKg: "30.000",
		baseAmount: "35.00",
		perKgAmount: "2.50",
	});
	// 30 kg+ (topo — weightToKg NULL = ∞)
	await tx.insert(carrierRate).values({
		id: crypto.randomUUID(),
		carrierId,
		zoneId: zoneBrId,
		weightFromKg: "30.000",
		weightToKg: null,
		baseAmount: "90.00",
		perKgAmount: "1.80",
	});
}
