import { describe, expect, it } from "vitest";
import { buildTabHref } from "./tab-url";

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
