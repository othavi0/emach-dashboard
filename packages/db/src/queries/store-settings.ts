import { eq } from "drizzle-orm";

import { branch } from "../schema/inventory";
import {
	type ShippingInsurancePolicy,
	storeSettings,
} from "../schema/store-settings";
import type { AnyDb } from "./catalog-helpers";

export interface ShippingSettings {
	insuranceCapAmount: number;
	insurancePolicy: ShippingInsurancePolicy;
	originBranchId: string | null;
	originCep: string | null;
}

const DEFAULTS: ShippingSettings = {
	originBranchId: null,
	originCep: null,
	insurancePolicy: "none",
	insuranceCapAmount: 3000,
};

/**
 * Settings de frete owned-by-dashboard. Consumido pelo storefront (emach-ecommerce)
 * via schema/query sincronizados por CI (ADR-0009). Substitui getOriginBranchCep()
 * baseado em env. Sem linha singleton → DEFAULTS (espelha o storefront atual).
 */
export async function getShippingSettings(
	db: AnyDb
): Promise<ShippingSettings> {
	const rows = await db
		.select({
			originBranchId: storeSettings.shippingOriginBranchId,
			originCep: branch.cep,
			insurancePolicy: storeSettings.shippingInsurancePolicy,
			insuranceCapAmount: storeSettings.shippingInsuranceCapAmount,
		})
		.from(storeSettings)
		.leftJoin(branch, eq(storeSettings.shippingOriginBranchId, branch.id))
		.where(eq(storeSettings.id, "singleton"))
		.limit(1);

	const row = rows[0];

	if (!row) {
		return DEFAULTS;
	}

	return {
		originBranchId: row.originBranchId,
		originCep: row.originCep,
		insurancePolicy: row.insurancePolicy,
		insuranceCapAmount: Number(row.insuranceCapAmount),
	};
}

export type SocialNetwork =
	| "instagram"
	| "linkedin"
	| "facebook"
	| "x"
	| "youtube";

export interface SocialLink {
	network: SocialNetwork;
	url: string;
}

/**
 * Links de redes sociais que o storefront deve exibir: só os que têm URL e
 * estão marcados como visíveis. Ordem fixa = ordem de exibição no site.
 * Owned-by-dashboard, consumido pelo emach-ecommerce via sync de CI (ADR-0009).
 */
export async function getStoreSocialLinks(db: AnyDb): Promise<SocialLink[]> {
	const rows = await db
		.select({
			instagramUrl: storeSettings.socialInstagramUrl,
			instagramVisible: storeSettings.socialInstagramVisible,
			linkedinUrl: storeSettings.socialLinkedinUrl,
			linkedinVisible: storeSettings.socialLinkedinVisible,
			facebookUrl: storeSettings.socialFacebookUrl,
			facebookVisible: storeSettings.socialFacebookVisible,
			xUrl: storeSettings.socialXUrl,
			xVisible: storeSettings.socialXVisible,
			youtubeUrl: storeSettings.socialYoutubeUrl,
			youtubeVisible: storeSettings.socialYoutubeVisible,
		})
		.from(storeSettings)
		.where(eq(storeSettings.id, "singleton"))
		.limit(1);

	const row = rows[0];

	if (!row) {
		return [];
	}

	const candidates: Array<{
		network: SocialNetwork;
		url: string | null;
		visible: boolean;
	}> = [
		{
			network: "instagram",
			url: row.instagramUrl,
			visible: row.instagramVisible,
		},
		{ network: "linkedin", url: row.linkedinUrl, visible: row.linkedinVisible },
		{ network: "facebook", url: row.facebookUrl, visible: row.facebookVisible },
		{ network: "x", url: row.xUrl, visible: row.xVisible },
		{ network: "youtube", url: row.youtubeUrl, visible: row.youtubeVisible },
	];

	return candidates.flatMap(({ network, url, visible }) =>
		visible && url ? [{ network, url }] : []
	);
}
