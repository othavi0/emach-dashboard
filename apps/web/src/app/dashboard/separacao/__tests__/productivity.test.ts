import { describe, expect, it } from "vitest";

import {
	exceptionTone,
	formatExceptionRate,
	formatSessionDuration,
} from "../_lib/productivity";

describe("formatSessionDuration", () => {
	it("null vira travessão (sem sessões na janela)", () => {
		expect(formatSessionDuration(null)).toBe("—");
	});

	it("abaixo de 1 minuto", () => {
		expect(formatSessionDuration(45)).toBe("<1min");
	});

	it("minutos arredondados", () => {
		expect(formatSessionDuration(540)).toBe("9min");
		expect(formatSessionDuration(90)).toBe("2min");
	});

	it("horas com resto de minutos", () => {
		expect(formatSessionDuration(4320)).toBe("1h 12min");
	});

	it("hora exata sem resto", () => {
		expect(formatSessionDuration(7200)).toBe("2h");
	});

	it("59,5min+ carrega para a hora seguinte", () => {
		// 1h59min30s → arredonda p/ 2h, não "1h 60min"
		expect(formatSessionDuration(7170)).toBe("2h");
	});
});

describe("formatExceptionRate", () => {
	it("zero exceções é 0% seco", () => {
		expect(formatExceptionRate(0, 41)).toBe("0%");
	});

	it("denominador zero não divide", () => {
		expect(formatExceptionRate(0, 0)).toBe("0%");
	});

	it("uma casa decimal em pt-BR (vírgula)", () => {
		expect(formatExceptionRate(1, 41)).toBe("2,4%");
		expect(formatExceptionRate(4, 87)).toBe("4,6%");
	});

	it("taxa inteira mantém a casa fixa (consistência de coluna)", () => {
		expect(formatExceptionRate(1, 20)).toBe("5,0%");
		expect(formatExceptionRate(1, 10)).toBe("10,0%");
	});
});

describe("exceptionTone", () => {
	it("zero é muted", () => {
		expect(exceptionTone(0, 41)).toBe("muted");
		expect(exceptionTone(0, 0)).toBe("muted");
	});

	it("abaixo de 5% é success", () => {
		expect(exceptionTone(1, 41)).toBe("success");
	});

	it("5% ou mais é warning", () => {
		expect(exceptionTone(2, 32)).toBe("warning");
	});
});
