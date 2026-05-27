import type { OrderStatus } from "@emach/db/schema/orders";
import { describe, expect, it } from "vitest";
import {
	AGING_THRESHOLDS_HOURS,
	type AgingLevel,
	formatAgingLabel,
	getAgingLevel,
} from "../src/app/dashboard/orders/_lib/aging";

const NOW = new Date("2026-05-27T12:00:00Z");

function hoursAgo(h: number): Date {
	return new Date(NOW.getTime() - h * 3_600_000);
}

describe("AGING_THRESHOLDS_HOURS (apertado)", () => {
	it("paid: 12h warn, 24h late", () => {
		expect(AGING_THRESHOLDS_HOURS.paid).toEqual({ warn: 12, late: 24 });
	});
	it("preparing: 24h warn, 48h late", () => {
		expect(AGING_THRESHOLDS_HOURS.preparing).toEqual({ warn: 24, late: 48 });
	});
	it("shipped: 168h (7d) warn, 336h (14d) late", () => {
		expect(AGING_THRESHOLDS_HOURS.shipped).toEqual({ warn: 168, late: 336 });
	});
});

describe("getAgingLevel", () => {
	it.each<[OrderStatus, number, AgingLevel]>([
		["paid", 6, "ok"],
		["paid", 13, "warn"],
		["paid", 25, "late"],
		["preparing", 23, "ok"],
		["preparing", 30, "warn"],
		["preparing", 49, "late"],
		["shipped", 100, "ok"],
		["shipped", 200, "warn"],
		["shipped", 400, "late"],
	])("status=%s, %sh atrás → %s", (status, hours, expected) => {
		expect(getAgingLevel(status, hoursAgo(hours), NOW)).toBe(expected);
	});

	it("retorna ok para status sem threshold", () => {
		expect(getAgingLevel("delivered", hoursAgo(1000), NOW)).toBe("ok");
		expect(getAgingLevel("refunded", hoursAgo(1000), NOW)).toBe("ok");
	});

	it("retorna ok se enteredAt for null", () => {
		expect(getAgingLevel("paid", null, NOW)).toBe("ok");
	});
});

describe("formatAgingLabel", () => {
	it("formata minutos/horas/dias em pt-BR curto", () => {
		expect(formatAgingLabel(hoursAgo(0.5), NOW)).toBe("há 30 min");
		expect(formatAgingLabel(hoursAgo(3), NOW)).toBe("há 3 h");
		expect(formatAgingLabel(hoursAgo(50), NOW)).toBe("há 2 d");
	});
});
