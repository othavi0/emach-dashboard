import { describe, expect, it } from "vitest";
import { formatBusinessPeriod } from "./branch";

describe("formatBusinessPeriod", () => {
	it("formata período aberto", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: null,
				breakEnd: null,
			})
		).toBe("08:00–18:00");
	});
	it("formata período com intervalo em dois turnos", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: "12:00",
				breakEnd: "13:00",
			})
		).toBe("08:00–12:00 · 13:00–18:00");
	});
	it("ignora intervalo incompleto (só breakStart)", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: "12:00",
				breakEnd: null,
			})
		).toBe("08:00–18:00");
	});
	it("retorna Fechado quando isOpen=false", () => {
		expect(
			formatBusinessPeriod({
				isOpen: false,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: null,
				breakEnd: null,
			})
		).toBe("Fechado");
	});
	it("retorna Fechado quando horários ausentes", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: null,
				closesAt: null,
				breakStart: null,
				breakEnd: null,
			})
		).toBe("Fechado");
	});
	it("retorna Fechado para null", () => {
		expect(formatBusinessPeriod(null)).toBe("Fechado");
	});
});
