import { TOOLS_PER_PROMO } from "@emach/db/queries/promo-limits";
import { describe, expect, it } from "vitest";
import {
	computeHomeVisibility,
	HOME_MAX_PRODUCTS,
	HOME_MIN_PRODUCTS,
} from "../featured-home";

describe("featured-home constants", () => {
	it("segue getFeaturedPromotion: mínimo 1, teto TOOLS_PER_PROMO", () => {
		expect(HOME_MIN_PRODUCTS).toBe(1);
		expect(HOME_MAX_PRODUCTS).toBe(TOOLS_PER_PROMO);
		expect(TOOLS_PER_PROMO).toBe(4);
	});
});

describe("computeHomeVisibility", () => {
	const base = {
		featured: true,
		appliesToAll: false,
		toolCount: 2,
		status: "active" as const,
	};

	it("não-featured não aparece", () => {
		expect(computeHomeVisibility({ ...base, featured: false })).toEqual({
			visible: false,
			reason: "not_featured",
		});
	});

	it("featured + active + 2 produtos específicos aparece", () => {
		expect(computeHomeVisibility(base)).toEqual({ visible: true });
	});

	it("featured + active + 1 produto aparece", () => {
		expect(computeHomeVisibility({ ...base, toolCount: 1 })).toEqual({
			visible: true,
		});
	});

	it("featured + active + 0 produtos específicos não aparece", () => {
		expect(computeHomeVisibility({ ...base, toolCount: 0 })).toEqual({
			visible: false,
			reason: "too_few_products",
		});
	});

	it("featured + appliesToAll ignora a contagem mínima", () => {
		expect(
			computeHomeVisibility({ ...base, appliesToAll: true, toolCount: 0 })
		).toEqual({ visible: true });
	});

	it("featured inativa não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "inactive" })).toEqual({
			visible: false,
			reason: "inactive",
		});
	});

	it("featured expirada não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "expired" })).toEqual({
			visible: false,
			reason: "expired",
		});
	});

	it("featured agendada ainda não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "scheduled" })).toEqual({
			visible: false,
			reason: "scheduled",
		});
	});
});
