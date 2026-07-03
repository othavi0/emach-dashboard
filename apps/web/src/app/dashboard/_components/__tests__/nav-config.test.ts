import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_GROUPS } from "../nav-config";

describe("isNavItemActive", () => {
	it("dashboard só ativo no path exato", () => {
		expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
		expect(isNavItemActive("/dashboard/orders", "/dashboard")).toBe(false);
	});
	it("item normal ativo no path e em sub-rotas", () => {
		expect(isNavItemActive("/dashboard/orders", "/dashboard/orders")).toBe(
			true
		);
		expect(isNavItemActive("/dashboard/orders/123", "/dashboard/orders")).toBe(
			true
		);
	});
	it("não casa prefixo parcial de segmento", () => {
		expect(isNavItemActive("/dashboard/orders-x", "/dashboard/orders")).toBe(
			false
		);
	});
});

describe("NAV_GROUPS — esquema por fluxo", () => {
	it("Dashboard é o único item do grupo sem rótulo, no topo", () => {
		// biome-ignore lint/style/noNonNullAssertion: array estático com comprimento conhecido
		expect(NAV_GROUPS[0]!.label).toBe("");
		// biome-ignore lint/style/noNonNullAssertion: array estático com comprimento conhecido
		expect(NAV_GROUPS[0]!.items.map((i) => i.label)).toEqual(["Dashboard"]);
	});

	it("grupos na ordem esperada", () => {
		expect(NAV_GROUPS.map((g) => g.label)).toEqual([
			"",
			"Vendas",
			"Catálogo",
			"Loja & Clientes",
			"Configuração",
			"Administração",
		]);
	});

	it("Movimentações em Vendas; Filiais em Configuração", () => {
		const groupOf = (label: string) =>
			NAV_GROUPS.find((g) => g.items.some((i) => i.label === label))?.label;
		expect(groupOf("Movimentações")).toBe("Vendas");
		expect(groupOf("Filiais")).toBe("Configuração");
	});

	it("não há item Notificações", () => {
		const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
		expect(all).not.toContain("Notificações");
	});

	it("item Filiais exige branches.read", () => {
		const filiais = NAV_GROUPS.flatMap((g) => g.items).find(
			(i) => i.label === "Filiais"
		);
		expect(filiais?.capability).toBe("branches.read");
	});
});
