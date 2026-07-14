import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ageMetaForTab } from "../age-meta";

const HA_PREFIX = /^há/;

// Relógio fixo (evita flake: datas absolutas comparadas contra Date.now() real
// mudam de bucket relativo conforme os dias passam).
const NOW = new Date("2026-07-10T12:00:00Z");

const base = {
	createdAt: new Date("2026-07-01T12:00:00Z"),
	paidAt: new Date("2026-07-02T12:00:00Z"),
	preparingAt: new Date("2026-07-02T18:00:00Z"),
	shippedAt: new Date("2026-07-03T12:00:00Z"),
	deliveredAt: new Date("2026-07-04T12:00:00Z"),
	status: "paid" as const,
};

describe("ageMetaForTab", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Pago há na fila paid e na tab mista late p/ pedido pago", () => {
		for (const tab of ["paid", "late"]) {
			expect(ageMetaForTab(tab, base).label).toBe("Pago há");
		}
	});

	it("Em separação há na fila preparing/picked e na tab mista late p/ pedido em separação", () => {
		const preparingBase = { ...base, status: "preparing" as const };
		for (const tab of ["preparing", "picked", "late"]) {
			expect(ageMetaForTab(tab, preparingBase).label).toBe("Em separação há");
		}
	});
	it("Enviado há / Entregue em / Criado há", () => {
		expect(ageMetaForTab("shipped", base).label).toBe("Enviado há");
		expect(ageMetaForTab("delivered", base).label).toBe("Entregue em");
		expect(ageMetaForTab("all", base).label).toBe("Criado há");
	});
	it("fallback para createdAt quando timestamp da etapa é null", () => {
		expect(ageMetaForTab("paid", { ...base, paidAt: null }).label).toBe(
			"Pago há"
		);
	});
	it("value nunca duplica o prefixo 'há' do label", () => {
		const { value } = ageMetaForTab("paid", base);
		expect(value).not.toMatch(HA_PREFIX);
	});

	it("paidAt de ontem (~26h) vira '1 dia', não a forma agramatical 'ontem'", () => {
		// NOW = 2026-07-10T12:00:00Z; 26h atrás = 2026-07-09T10:00:00Z (ontem)
		const paidAt = new Date("2026-07-09T10:00:00Z");
		const { value } = ageMetaForTab("paid", { ...base, paidAt });
		expect(value).toBe("1 dia");
		expect(value).not.toBe("ontem");
	});

	it("shippedAt de anteontem (~50h) vira '2 dias', não a forma agramatical 'anteontem'", () => {
		// NOW = 2026-07-10T12:00:00Z; 50h atrás = 2026-07-08T10:00:00Z (anteontem)
		const shippedAt = new Date("2026-07-08T10:00:00Z");
		const { value } = ageMetaForTab("shipped", { ...base, shippedAt });
		expect(value).toBe("2 dias");
		expect(value).not.toBe("anteontem");
	});

	it("paidAt agora mesmo vira 'instantes', não a forma agramatical 'este minuto'", () => {
		const paidAt = new Date(NOW);
		const { value } = ageMetaForTab("paid", { ...base, paidAt });
		expect(value).toBe("instantes");
		expect(value).not.toBe("este minuto");
	});
});
