import { describe, expect, it } from "vitest";
import { type KpiCaps, kpiGridClass, visibleKpiCount } from "../kpi-grid";

const ALL_FALSE: KpiCaps = {
	canReadCustomers: false,
	canReadPromotions: false,
	canReadReviews: false,
};
const ALL_TRUE: KpiCaps = {
	canReadCustomers: true,
	canReadPromotions: true,
	canReadReviews: true,
};

describe("visibleKpiCount", () => {
	it("user (sem reviews/customers/promotions) vê só os 2 base", () => {
		// Pedidos + Rupturas são sempre visíveis (orders.read/stock.read = SAU).
		expect(visibleKpiCount(ALL_FALSE)).toBe(2);
	});

	it("admin/super_admin (todas as caps) vê os 5 KPIs", () => {
		expect(visibleKpiCount(ALL_TRUE)).toBe(5);
	});

	it("cada capability restrita soma exatamente 1 KPI", () => {
		expect(visibleKpiCount({ ...ALL_FALSE, canReadReviews: true })).toBe(3);
		expect(visibleKpiCount({ ...ALL_FALSE, canReadCustomers: true })).toBe(3);
		expect(visibleKpiCount({ ...ALL_FALSE, canReadPromotions: true })).toBe(3);
		expect(
			visibleKpiCount({
				...ALL_FALSE,
				canReadReviews: true,
				canReadCustomers: true,
			})
		).toBe(4);
	});
});

describe("kpiGridClass", () => {
	it("nunca deixa buraco: cada contagem tem classe própria de colunas", () => {
		// O grid base é grid-cols-2; estas classes ajustam md/xl à contagem real.
		expect(kpiGridClass(2)).toBe("xl:grid-cols-2");
		expect(kpiGridClass(3)).toBe("md:grid-cols-3 xl:grid-cols-3");
		expect(kpiGridClass(4)).toBe("md:grid-cols-2 xl:grid-cols-4");
		expect(kpiGridClass(5)).toBe("md:grid-cols-3 xl:grid-cols-5");
	});

	it("contagem fora do mapa cai no fallback de 5 colunas", () => {
		expect(kpiGridClass(7)).toBe("md:grid-cols-3 xl:grid-cols-5");
	});

	it("a contagem de cada role resolve para uma classe definida", () => {
		expect(kpiGridClass(visibleKpiCount(ALL_FALSE))).toBe("xl:grid-cols-2");
		expect(kpiGridClass(visibleKpiCount(ALL_TRUE))).toBe(
			"md:grid-cols-3 xl:grid-cols-5"
		);
	});
});
