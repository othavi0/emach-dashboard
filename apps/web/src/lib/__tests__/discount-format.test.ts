import { describe, expect, it } from "vitest";
import {
	formatMoney,
	formatPercent,
	parseMoney,
	parsePercent,
	sanitizePercent,
} from "../discount-format";

describe("discount-format", () => {
	it("percent: nunca gruda zero à esquerda nem mantém símbolo", () => {
		expect(sanitizePercent("0%10")).toBe("010"); // texto cru sanitizado…
		expect(parsePercent("10")).toBe(10);
		expect(parsePercent("10,5")).toBe(10.5);
		expect(parsePercent("250")).toBe(100); // clamp 100
		expect(formatPercent(10)).toBe("10");
		expect(formatPercent(10.5)).toBe("10,5");
		expect(formatPercent(0)).toBe("");
	});

	it("money: digit-shift em centavos, sem símbolo", () => {
		expect(parseMoney("15000")).toBe(150);
		expect(parseMoney("R$ 1,50")).toBe(1.5);
		expect(parseMoney("")).toBe(0);
		expect(formatMoney(150)).toBe("150,00");
		expect(formatMoney(1234.5)).toBe("1.234,50");
		expect(formatMoney(0)).toBe("");
	});
});
