import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { branch } from "../schema/inventory";
import {
	type ShippingInsurancePolicy,
	storeSettings,
} from "../schema/store-settings";

export type ShippingSettings = {
	originBranchId: string | null;
	originCep: string | null;
	insurancePolicy: ShippingInsurancePolicy;
	insuranceCapAmount: number;
};

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
	db: NodePgDatabase<Record<string, unknown>>
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
