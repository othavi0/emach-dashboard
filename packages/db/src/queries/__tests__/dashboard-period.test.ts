import { describe, expect, it } from "vitest";
import {
	computeDeltaPct,
	DASHBOARD_PERIODS,
	DEFAULT_PERIOD,
	periodToConfig,
} from "../dashboard-period";

describe("dashboard-period", () => {
	it("DEFAULT_PERIOD é 30d e está na lista", () => {
		expect(DEFAULT_PERIOD).toBe("30d");
		expect(DASHBOARD_PERIODS).toContain("30d");
	});
	it("periodToConfig mapeia janela e bucket adaptativo", () => {
		expect(periodToConfig("7d")).toEqual({
			days: 7,
			bucket: "day",
			maWindow: 7,
		});
		expect(periodToConfig("30d")).toEqual({
			days: 30,
			bucket: "day",
			maWindow: 7,
		});
		expect(periodToConfig("90d")).toEqual({
			days: 90,
			bucket: "week",
			maWindow: 4,
		});
		expect(periodToConfig("12m")).toEqual({
			days: 365,
			bucket: "month",
			maWindow: 3,
		});
	});
	it("computeDeltaPct: positivo, negativo e guarda divisão por zero", () => {
		expect(computeDeltaPct(110, 100)).toBe(10);
		expect(computeDeltaPct(90, 100)).toBe(-10);
		expect(computeDeltaPct(50, 0)).toBeNull();
		expect(computeDeltaPct(0, 0)).toBeNull();
	});
});
