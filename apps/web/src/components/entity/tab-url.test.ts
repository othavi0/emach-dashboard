import { describe, expect, it } from "vitest";
import { buildTabHref, clampInitialTab, resolveTabFromSearch } from "./tab-url";

const KNOWN = ["visao-geral", "estoque", "atividade"];

describe("resolveTabFromSearch", () => {
	it("resolve tab conhecida presente na query", () => {
		expect(resolveTabFromSearch("?tab=estoque", KNOWN, "visao-geral")).toBe(
			"estoque"
		);
	});

	it("cai no default quando o param está ausente", () => {
		expect(resolveTabFromSearch("", KNOWN, "visao-geral")).toBe("visao-geral");
	});

	it("clampa valor desconhecido para o default", () => {
		expect(resolveTabFromSearch("?tab=hacker", KNOWN, "visao-geral")).toBe(
			"visao-geral"
		);
	});

	it("respeita um paramName customizado", () => {
		expect(
			resolveTabFromSearch("?view=atividade", KNOWN, "visao-geral", "view")
		).toBe("atividade");
	});
});

describe("buildTabHref", () => {
	it("remove o paramName quando a tab é o default", () => {
		const sp = new URLSearchParams("tab=estoque");
		expect(buildTabHref("/x", sp, "visao-geral", "visao-geral")).toBe("/x");
	});

	it("seta o paramName quando a tab não é o default", () => {
		const sp = new URLSearchParams();
		expect(buildTabHref("/x", sp, "estoque", "visao-geral")).toBe(
			"/x?tab=estoque"
		);
	});

	it("preserva outros params e remove os de clearParams", () => {
		const sp = new URLSearchParams("variant=v1&q=furadeira");
		expect(
			buildTabHref("/x", sp, "estoque", "visao-geral", "tab", ["variant"])
		).toBe("/x?q=furadeira&tab=estoque");
	});

	it("respeita um paramName customizado", () => {
		const sp = new URLSearchParams();
		expect(buildTabHref("/x", sp, "b", "a", "view")).toBe("/x?view=b");
	});
});

describe("clampInitialTab", () => {
	const TABS = [{ value: "overview" }, { value: "estoque" }];

	it("aceita tab conhecida", () => {
		expect(clampInitialTab("estoque", TABS, "overview")).toBe("estoque");
	});

	it("cai no default quando raw é undefined", () => {
		expect(clampInitialTab(undefined, TABS, "overview")).toBe("overview");
	});

	it("clampa valor desconhecido para o default", () => {
		expect(clampInitialTab("hacker", TABS, "overview")).toBe("overview");
	});
});
