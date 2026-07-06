import "server-only";

import { db } from "@emach/db";
import { getActiveBoxes } from "@emach/db/queries/shipping";
import { getShippingSettings } from "@emach/db/queries/store-settings";
import { shippingBox } from "@emach/db/schema/shipping";
import { tool } from "@emach/db/schema/tools";
import { and, asc, eq } from "drizzle-orm";

import { fitsAnyActiveBox } from "@/app/dashboard/tools/_lib/fits-shipping-box";

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

export interface ToolWithoutBox {
	heightCm: string;
	id: string;
	lengthCm: string;
	name: string;
	weightKg: string;
	widthCm: string;
}

/** Produtos ativos que consolidam em caixa mas não cabem em NENHUMA caixa
 * ativa — na loja saem como "Frete a combinar". Mesma régua do checkout. */
export async function getToolsWithoutBox(): Promise<ToolWithoutBox[]> {
	const [activeBoxes, settings, rows] = await Promise.all([
		getActiveBoxes(db),
		getShippingSettings(db),
		db
			.select({
				id: tool.id,
				name: tool.name,
				weightKg: tool.weightKg,
				lengthCm: tool.lengthCm,
				widthCm: tool.widthCm,
				heightCm: tool.heightCm,
				packagingWeightKg: tool.packagingWeightKg,
				stackable: tool.stackable,
				uprightOnly: tool.uprightOnly,
			})
			.from(tool)
			.where(and(eq(tool.status, "active"), eq(tool.shipsInOwnBox, false)))
			.orderBy(asc(tool.name)),
	]);

	return rows
		.filter(
			(r) =>
				!fitsAnyActiveBox(
					{
						lengthCm: Number(r.lengthCm),
						widthCm: Number(r.widthCm),
						heightCm: Number(r.heightCm),
						weightKg: Number(r.weightKg),
						packagingWeightKg: Number(r.packagingWeightKg),
						stackable: r.stackable,
						uprightOnly: r.uprightOnly,
					},
					activeBoxes,
					settings.fillFactor
				)
		)
		.map(({ id, name, weightKg, lengthCm, widthCm, heightCm }) => ({
			id,
			name,
			weightKg,
			lengthCm,
			widthCm,
			heightCm,
		}));
}
