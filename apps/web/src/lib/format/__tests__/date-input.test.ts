import { describe, expect, it } from "vitest";
import {
	endOfDaySaoPaulo,
	saoPauloDayKey,
	startOfDaySaoPaulo,
} from "../date-input";

describe("date-input (fuso America/Sao_Paulo, offset -03:00)", () => {
	it("saoPauloDayKey usa o dia civil de Brasília, não UTC", () => {
		// 2026-06-12T02:00:00Z = 2026-06-11 23:00 em SP
		expect(saoPauloDayKey(new Date("2026-06-12T02:00:00Z"))).toBe("2026-06-11");
		// 2026-06-12T10:00:00Z = 2026-06-12 07:00 em SP
		expect(saoPauloDayKey(new Date("2026-06-12T10:00:00Z"))).toBe("2026-06-12");
	});

	it("startOfDaySaoPaulo retorna 00:00 do dia SP (03:00Z)", () => {
		expect(
			startOfDaySaoPaulo(new Date("2026-06-12T10:00:00Z")).toISOString()
		).toBe("2026-06-12T03:00:00.000Z");
	});

	it("endOfDaySaoPaulo retorna 23:59:59.999 do dia SP (02:59Z do dia seguinte)", () => {
		expect(
			endOfDaySaoPaulo(new Date("2026-06-12T10:00:00Z")).toISOString()
		).toBe("2026-06-13T02:59:59.999Z");
	});
});
