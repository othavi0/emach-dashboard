import { describe, expect, it } from "vitest";
import { isNavItemActive } from "../nav-config";

describe("isNavItemActive", () => {
	it("dashboard só ativo no path exato", () => {
		expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
		expect(isNavItemActive("/dashboard/orders", "/dashboard")).toBe(false);
	});
	it("item normal ativo no path e em sub-rotas", () => {
		expect(isNavItemActive("/dashboard/orders", "/dashboard/orders")).toBe(true);
		expect(isNavItemActive("/dashboard/orders/123", "/dashboard/orders")).toBe(true);
	});
	it("não casa prefixo parcial de segmento", () => {
		expect(isNavItemActive("/dashboard/orders-x", "/dashboard/orders")).toBe(false);
	});
});
