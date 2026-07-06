import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { branch } from "../schema/inventory";
import {
	type ShippingInsurancePolicy,
	storeSettings,
} from "../schema/store-settings";

export interface ShippingSettings {
	boxPaddingCm: number;
	fillFactor: number;
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
	fillFactor: 0.9,
	boxPaddingCm: 0,
};

/**
 * Settings de frete owned-by-dashboard. Consumido pelo storefront (emach-ecommerce)
 * via schema/query sincronizados por CI (ADR-0009). Substitui getOriginBranchCep()
 * baseado em env. Sem linha singleton → DEFAULTS (espelha o storefront atual).
 */
export async function getShippingSettings(
	db: NodePgDatabase<Record<string, unknown>>
): Promise<ShippingSettings> {
	const rows = await db
		.select({
			originBranchId: storeSettings.shippingOriginBranchId,
			originCep: branch.cep,
			insurancePolicy: storeSettings.shippingInsurancePolicy,
			insuranceCapAmount: storeSettings.shippingInsuranceCapAmount,
			fillFactor: storeSettings.shippingFillFactor,
			boxPaddingCm: storeSettings.shippingBoxPaddingCm,
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
		fillFactor: Number(row.fillFactor),
		boxPaddingCm: Number(row.boxPaddingCm),
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
export async function getStoreSocialLinks(
	db: NodePgDatabase<Record<string, unknown>>
): Promise<SocialLink[]> {
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

	return candidates
		.filter(
			(c): c is { network: SocialNetwork; url: string; visible: boolean } =>
				Boolean(c.visible && c.url)
		)
		.map(({ network, url }) => ({ network, url }));
}
