// packages/db/scripts/seed/shipping.ts
import { shippingBox } from "@emach/db/schema/shipping";
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

export async function seedShipping(tx: Tx): Promise<void> {
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
}
