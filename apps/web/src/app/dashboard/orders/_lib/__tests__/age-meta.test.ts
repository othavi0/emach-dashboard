import { describe, expect, it } from "vitest";
import { ageMetaForTab } from "../age-meta";

const HA_PREFIX = /^há/;

const base = {
	createdAt: new Date("2026-07-01T12:00:00Z"),
	paidAt: new Date("2026-07-02T12:00:00Z"),
	shippedAt: new Date("2026-07-03T12:00:00Z"),
	deliveredAt: new Date("2026-07-04T12:00:00Z"),
};

describe("ageMetaForTab", () => {
	it("Pago há nas filas de expedição", () => {
		for (const tab of ["paid", "preparing", "late"]) {
			expect(ageMetaForTab(tab, base).label).toBe("Pago há");
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
});
