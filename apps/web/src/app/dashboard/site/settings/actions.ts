"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	type StoreSettings,
	storeSettings,
} from "@emach/db/schema/store-settings";
import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./_components/shipping-schema";
import {
	type SocialSettingsFormValues,
	socialSettingsSchema,
} from "./_components/social-schema";

const SETTINGS_PATH = "/dashboard/site/settings";
const SINGLETON_ID = "singleton";

/** Lê o singleton; cria com defaults na primeira leitura (lazy bootstrap). */
export async function getOrCreateShippingSettings(): Promise<StoreSettings> {
	await requireCapability("site.update_settings");

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
	await requireCapability("site.update_settings");

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
	const session = await requireCapability("site.update_settings");

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
	revalidatePath(SETTINGS_PATH);
	return { ok: true, data: { id: SINGLETON_ID } };
}

export async function updateSocialSettings(
	input: SocialSettingsFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("site.update_settings");

	const parsed = socialSettingsSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}
	const d = parsed.data;

	// Sem URL → força oculto (defesa-em-profundidade; o form já desabilita o switch).
	const payload = {
		socialInstagramUrl: d.instagramUrl ?? null,
		socialInstagramVisible: Boolean(d.instagramUrl) && d.instagramVisible,
		socialLinkedinUrl: d.linkedinUrl ?? null,
		socialLinkedinVisible: Boolean(d.linkedinUrl) && d.linkedinVisible,
		socialFacebookUrl: d.facebookUrl ?? null,
		socialFacebookVisible: Boolean(d.facebookUrl) && d.facebookVisible,
		socialXUrl: d.xUrl ?? null,
		socialXVisible: Boolean(d.xUrl) && d.xVisible,
		socialYoutubeUrl: d.youtubeUrl ?? null,
		socialYoutubeVisible: Boolean(d.youtubeUrl) && d.youtubeVisible,
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
		logger.error("updateSocialSettings falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}

	const visibleNetworks = [
		payload.socialInstagramVisible && "instagram",
		payload.socialLinkedinVisible && "linkedin",
		payload.socialFacebookVisible && "facebook",
		payload.socialXVisible && "x",
		payload.socialYoutubeVisible && "youtube",
	].filter(Boolean);

	await logUserActivity({
		actorUserId: session.user.id,
		action: "settings.social.updated",
		targetId: SINGLETON_ID,
		targetType: "store_settings",
		metadata: { visible: visibleNetworks },
	});
	revalidatePath(SETTINGS_PATH);
	return { ok: true, data: { id: SINGLETON_ID } };
}
