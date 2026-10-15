import { TOOLS_PER_PROMO } from "@emach/db/queries/promo-limits";
import type { PromotionStatus } from "./promotion-types";

/**
 * Espelha `getFeaturedPromotion`, a query que a loja chama: ela só esconde a
 * promoção específica sem ferramentas e corta a lista em TOOLS_PER_PROMO.
 * Ver docs/integration/admin-ecommerce.md.
 */
export const HOME_MIN_PRODUCTS = 1;
export const HOME_MAX_PRODUCTS = TOOLS_PER_PROMO;

export type HomeInvisibleReason =
	| "not_featured"
	| "inactive"
	| "expired"
	| "scheduled"
	| "too_few_products";

export type HomeVisibility =
	| { visible: true }
	| { visible: false; reason: HomeInvisibleReason };

/**
 * Status derivado de uma promoção a partir de active + janela de vigência.
 * Vive aqui (módulo puro, sem @emach/db) para ser reusável tanto por código de
 * servidor quanto por Client Components.
 */
export function computeStatus(p: {
	active: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
}): PromotionStatus {
	const now = new Date();

	if (p.endsAt && p.endsAt < now) {
		return "expired";
	}

	if (!p.active) {
		return "inactive";
	}

	if (p.startsAt && p.startsAt > now) {
		return "scheduled";
	}

	return "active";
}

/**
 * Por que uma promoção (não-)aparece na seção de destaque da home.
 * Replica o contrato do storefront: precisa estar featured, ativa, dentro da
 * vigência e, quando aplica a ferramentas específicas, ter ao menos
 * HOME_MIN_PRODUCTS produto vinculado.
 */
export function computeHomeVisibility(input: {
	featured: boolean;
	appliesToAll: boolean;
	toolCount: number;
	status: PromotionStatus;
}): HomeVisibility {
	if (!input.featured) {
		return { visible: false, reason: "not_featured" };
	}

	if (input.status === "expired") {
		return { visible: false, reason: "expired" };
	}

	if (input.status === "inactive") {
		return { visible: false, reason: "inactive" };
	}

	if (input.status === "scheduled") {
		return { visible: false, reason: "scheduled" };
	}

	if (!input.appliesToAll && input.toolCount < HOME_MIN_PRODUCTS) {
		return { visible: false, reason: "too_few_products" };
	}

	return { visible: true };
}
