"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	carrier,
	carrierRate,
	carrierZone,
	shippingBox,
} from "@emach/db/schema/shipping";
import {
	type StoreSettings,
	storeSettings,
} from "@emach/db/schema/store-settings";
import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { normalizeCnpj } from "@/lib/cpf-cnpj";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import type { BoxFormValues } from "./_components/box-schema";
import { boxSchema } from "./_components/box-schema";
import {
	type CarrierFormValues,
	type CreateCarrierFormValues,
	carrierSchema,
	createCarrierSchema,
} from "./_components/carrier-schema";
import {
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./_components/shipping-schema";
import {
	type RateRow,
	ratesSchema,
	type ZoneFormValues,
	zoneSchema,
} from "./_components/zone-schema";
import type { CarrierBaseRow } from "./data";

const SHIPPING_PATH = "/dashboard/shipping";
const SINGLETON_ID = "singleton";

/** Lê o singleton; cria com defaults na primeira leitura (lazy bootstrap). */
export async function getOrCreateShippingSettings(): Promise<StoreSettings> {
	await requireCapability("shipping.read");

	const existing = await db
		.select()
		.from(storeSettings)
		.where(eq(storeSettings.id, SINGLETON_ID))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [created] = await db
		.insert(storeSettings)
		.values({ id: SINGLETON_ID })
		.onConflictDoNothing()
		.returning();
	if (created) {
		return created;
	}
	// Corrida: outra request criou entre o select e o insert.
	const [row] = await db
		.select()
		.from(storeSettings)
		.where(eq(storeSettings.id, SINGLETON_ID))
		.limit(1);
	if (!row) {
		throw new Error("Falha ao inicializar store_settings");
	}
	return row;
}

export interface OriginBranchOption {
	cep: string;
	id: string;
	name: string;
}

/** Filiais ativas com CEP preenchido — candidatas a origem do despacho. */
export async function listOriginBranchOptions(): Promise<OriginBranchOption[]> {
	await requireCapability("shipping.read");

	const rows = await db
		.select({ id: branch.id, name: branch.name, cep: branch.cep })
		.from(branch)
		.where(isNotNull(branch.cep))
		.orderBy(asc(branch.name));
	return rows.filter((r): r is OriginBranchOption => Boolean(r.cep));
}

export async function updateShippingSettings(
	input: ShippingSettingsFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");

	const parsed = shippingSettingsSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}

	const payload = {
		shippingOriginBranchId: parsed.data.originBranchId ?? null,
		shippingInsurancePolicy: parsed.data.insurancePolicy,
		shippingInsuranceCapAmount: parsed.data.insuranceCapAmount.toFixed(2),
	};

	try {
		await db
			.insert(storeSettings)
			.values({ id: SINGLETON_ID, ...payload })
			.onConflictDoUpdate({
				target: storeSettings.id,
				set: payload,
			});
	} catch (error) {
		logger.error("updateShippingSettings falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "settings.shipping.updated",
		targetId: SINGLETON_ID,
		targetType: "store_settings",
		metadata: {
			insurancePolicy: payload.shippingInsurancePolicy,
			originBranchId: payload.shippingOriginBranchId,
		},
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id: SINGLETON_ID } };
}

export async function createBox(
	input: BoxFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = boxSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	try {
		await db.insert(shippingBox).values({
			id,
			name: parsed.data.name,
			internalLengthCm: parsed.data.internalLengthCm.toString(),
			internalWidthCm: parsed.data.internalWidthCm.toString(),
			internalHeightCm: parsed.data.internalHeightCm.toString(),
			maxWeightKg: parsed.data.maxWeightKg.toString(),
			tareWeightKg: parsed.data.tareWeightKg.toString(),
			active: parsed.data.active,
		});
	} catch (error) {
		logger.error("createBox falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.box.created",
		targetId: id,
		targetType: "shipping_box",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function updateBox(
	id: string,
	input: BoxFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = boxSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	try {
		await db
			.update(shippingBox)
			.set({
				name: parsed.data.name,
				internalLengthCm: parsed.data.internalLengthCm.toString(),
				internalWidthCm: parsed.data.internalWidthCm.toString(),
				internalHeightCm: parsed.data.internalHeightCm.toString(),
				maxWeightKg: parsed.data.maxWeightKg.toString(),
				tareWeightKg: parsed.data.tareWeightKg.toString(),
				active: parsed.data.active,
			})
			.where(eq(shippingBox.id, id));
	} catch (error) {
		logger.error("updateBox falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.box.updated",
		targetId: id,
		targetType: "shipping_box",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function fetchCarriersPage({
	cursor,
}: {
	cursor: string | null;
}): Promise<InfiniteResult<CarrierBaseRow>> {
	await requireCapability("shipping.read");
	const { getCarriersPage } = await import("./data");
	return getCarriersPage({ cursor });
}

function numOrNull(v: number | null | undefined): string | null {
	return v === null || v === undefined ? null : v.toString();
}

export async function createCarrier(
	input: CarrierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = carrierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	try {
		await db.insert(carrier).values({
			id,
			name: parsed.data.name,
			cnpj: parsed.data.cnpj ? normalizeCnpj(parsed.data.cnpj) : null,
			active: parsed.data.active,
			cubageDivisor: parsed.data.cubageDivisor,
			grisPercent: numOrNull(parsed.data.grisPercent),
			grisMinAmount: numOrNull(parsed.data.grisMinAmount),
			advaloremPercent: numOrNull(parsed.data.advaloremPercent),
			icmsPercent: numOrNull(parsed.data.icmsPercent),
			notes: parsed.data.notes || null,
		});
	} catch (error) {
		logger.error("createCarrier falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.carrier.created",
		targetId: id,
		targetType: "carrier",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function createCarrierWithZones(
	input: CreateCarrierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = createCarrierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const d = parsed.data;
	const id = crypto.randomUUID();
	try {
		await db.transaction(async (tx) => {
			await tx.insert(carrier).values({
				id,
				name: d.name,
				cnpj: normalizeCnpj(d.cnpj),
				active: d.active,
				cubageDivisor: d.cubageDivisor,
				grisPercent: d.grisPercent.toString(),
				grisMinAmount: numOrNull(d.grisMinAmount),
				advaloremPercent: d.advaloremPercent.toString(),
				icmsPercent: d.icmsPercent.toString(),
				notes: d.notes || null,
			});
			for (const [index, zone] of d.zones.entries()) {
				const zoneId = crypto.randomUUID();
				await tx.insert(carrierZone).values({
					id: zoneId,
					carrierId: id,
					name: zone.name,
					cepRanges: zone.cepRanges,
					deliveryDays: zone.deliveryDays ?? null,
					minFreightAmount: numOrNull(zone.minFreightAmount),
					sortOrder: index,
				});
				await tx.insert(carrierRate).values(
					zone.rates.map((r) => ({
						id: crypto.randomUUID(),
						carrierId: id,
						zoneId,
						weightFromKg: r.weightFromKg.toString(),
						weightToKg: r.weightToKg == null ? null : r.weightToKg.toString(),
						baseAmount: r.baseAmount.toString(),
						perKgAmount: r.perKgAmount.toString(),
					}))
				);
			}
		});
	} catch (error) {
		if (getPgError(error)?.code === "23505") {
			return { ok: false, error: "CNPJ já cadastrado em outra transportadora" };
		}
		logger.error("createCarrierWithZones falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.carrier.created",
		targetId: id,
		targetType: "carrier",
		metadata: { name: d.name, zones: d.zones.length },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function updateCarrier(
	id: string,
	input: CarrierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = carrierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	try {
		await db
			.update(carrier)
			.set({
				name: parsed.data.name,
				cnpj: parsed.data.cnpj ? normalizeCnpj(parsed.data.cnpj) : null,
				active: parsed.data.active,
				cubageDivisor: parsed.data.cubageDivisor,
				grisPercent: numOrNull(parsed.data.grisPercent),
				grisMinAmount: numOrNull(parsed.data.grisMinAmount),
				advaloremPercent: numOrNull(parsed.data.advaloremPercent),
				icmsPercent: numOrNull(parsed.data.icmsPercent),
				notes: parsed.data.notes || null,
			})
			.where(eq(carrier.id, id));
	} catch (error) {
		logger.error("updateCarrier falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.carrier.updated",
		targetId: id,
		targetType: "carrier",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	revalidatePath(`/dashboard/shipping/carriers/${id}`);
	return { ok: true, data: { id } };
}

export async function deleteCarrier(
	id: string
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	try {
		await db.delete(carrier).where(eq(carrier.id, id));
	} catch (error) {
		logger.error("deleteCarrier falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.carrier.deleted",
		targetId: id,
		targetType: "carrier",
		metadata: {},
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function upsertZone(
	carrierId: string,
	zoneId: string | null,
	input: ZoneFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = zoneSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const id = zoneId ?? crypto.randomUUID();
	try {
		if (zoneId) {
			await db
				.update(carrierZone)
				.set({
					name: parsed.data.name,
					cepRanges: parsed.data.cepRanges,
					deliveryDays: parsed.data.deliveryDays ?? null,
					minFreightAmount:
						parsed.data.minFreightAmount == null
							? null
							: parsed.data.minFreightAmount.toString(),
				})
				.where(eq(carrierZone.id, zoneId));
		} else {
			await db.insert(carrierZone).values({
				id,
				carrierId,
				name: parsed.data.name,
				cepRanges: parsed.data.cepRanges,
				deliveryDays: parsed.data.deliveryDays ?? null,
				minFreightAmount:
					parsed.data.minFreightAmount == null
						? null
						: parsed.data.minFreightAmount.toString(),
			});
		}
	} catch (error) {
		logger.error("upsertZone falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.zone.upserted",
		targetId: id,
		targetType: "carrier_zone",
		metadata: { carrierId, name: parsed.data.name },
	});
	revalidatePath(`/dashboard/shipping/carriers/${carrierId}`);
	return { ok: true, data: { id } };
}

export async function deleteZone(
	carrierId: string,
	zoneId: string
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	try {
		await db.delete(carrierZone).where(eq(carrierZone.id, zoneId));
	} catch (error) {
		logger.error("deleteZone falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.zone.deleted",
		targetId: zoneId,
		targetType: "carrier_zone",
		metadata: { carrierId },
	});
	revalidatePath(`/dashboard/shipping/carriers/${carrierId}`);
	return { ok: true, data: { id: zoneId } };
}

export async function saveZoneRates(
	carrierId: string,
	zoneId: string,
	rows: RateRow[]
): Promise<ActionResult<{ count: number }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = ratesSchema.safeParse(rows);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	try {
		await db.transaction(async (tx) => {
			await tx.delete(carrierRate).where(eq(carrierRate.zoneId, zoneId));
			if (parsed.data.length > 0) {
				await tx.insert(carrierRate).values(
					parsed.data.map((r) => ({
						id: crypto.randomUUID(),
						carrierId,
						zoneId,
						weightFromKg: r.weightFromKg.toString(),
						weightToKg: r.weightToKg == null ? null : r.weightToKg.toString(),
						baseAmount: r.baseAmount.toString(),
						perKgAmount: r.perKgAmount.toString(),
					}))
				);
			}
		});
	} catch (error) {
		logger.error("saveZoneRates falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.rates.saved",
		targetId: zoneId,
		targetType: "carrier_zone",
		metadata: { carrierId, count: parsed.data.length },
	});
	revalidatePath(`/dashboard/shipping/carriers/${carrierId}`);
	return { ok: true, data: { count: parsed.data.length } };
}
