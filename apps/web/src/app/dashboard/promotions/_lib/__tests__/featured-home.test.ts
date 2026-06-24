import { describe, expect, it } from "vitest";
import {
	computeHomeVisibility,
	HOME_MAX_PRODUCTS,
	HOME_MIN_PRODUCTS,
} from "../featured-home";

describe("featured-home constants", () => {
	it("espelha o contrato do storefront", () => {
		expect(HOME_MIN_PRODUCTS).toBe(2);
		expect(HOME_MAX_PRODUCTS).toBe(4);
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

	it("featured + active + 1 produto não aparece (poucos produtos)", () => {
		expect(computeHomeVisibility({ ...base, toolCount: 1 })).toEqual({
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
