import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelative } from "./datetime";

const NOW = new Date("2026-06-23T12:00:00.000Z").getTime();

function ago(ms: number) {
	return new Date(NOW - ms);
}
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const RE_MIN = /min/;
const RE_HORA = /h|hora/;
const RE_DIA = /dia/;
const RE_MES = /m[eê]s/;
const RE_ANO = /ano/;

describe("formatRelative", () => {
	afterEach(() => vi.restoreAllMocks());

	function withNow(fn: () => void) {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		fn();
	}

	it("usa minutos abaixo de 1h", () => {
		withNow(() => expect(formatRelative(ago(5 * MIN))).toMatch(RE_MIN));
	});
	it("usa horas abaixo de 24h", () => {
		withNow(() => expect(formatRelative(ago(3 * HOUR))).toMatch(RE_HORA));
	});
	it("usa dias abaixo de 30d", () => {
		withNow(() => expect(formatRelative(ago(5 * DAY))).toMatch(RE_DIA));
	});
	it("usa meses entre 30d e 12 meses", () => {
		withNow(() => expect(formatRelative(ago(70 * DAY))).toMatch(RE_MES));
	});
	it("usa anos acima de 12 meses", () => {
		withNow(() => expect(formatRelative(ago(400 * DAY))).toMatch(RE_ANO));
	});
});
