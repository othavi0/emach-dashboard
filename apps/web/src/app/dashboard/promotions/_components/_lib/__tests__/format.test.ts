import { describe, expect, it } from "vitest";

import { daysRemainingDisplay, daysUntil } from "../format";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("daysUntil", () => {
	it("retorna null para data nula", () => {
		expect(daysUntil(null, NOW)).toBeNull();
	});
	it("conta dias inteiros à frente", () => {
		expect(daysUntil(new Date("2026-06-11T12:00:00Z"), NOW)).toBe(10);
	});
	it("é negativo para datas passadas", () => {
		expect(daysUntil(new Date("2026-05-30T12:00:00Z"), NOW)).toBe(-2);
	});
});

describe("daysRemainingDisplay", () => {
	it("expirada → 0 / danger", () => {
		expect(
			daysRemainingDisplay("expired", new Date("2026-05-01T12:00:00Z"), NOW)
		).toEqual({ value: "0", tone: "danger" });
	});
	it("sem endsAt → — / default", () => {
		expect(daysRemainingDisplay("active", null, NOW)).toEqual({
			value: "—",
			tone: "default",
		});
	});
	it("≤7 dias → warning", () => {
		expect(
			daysRemainingDisplay("active", new Date("2026-06-06T12:00:00Z"), NOW)
		).toEqual({ value: "5", tone: "warning" });
	});
	it(">7 dias → default", () => {
		expect(
			daysRemainingDisplay("active", new Date("2026-06-20T12:00:00Z"), NOW)
		).toEqual({ value: "19", tone: "default" });
	});
});
