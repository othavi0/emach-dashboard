import { describe, expect, it } from "vitest";
import { buildTabHref } from "./tab-url";

describe("buildTabHref", () => {
	it("remove o param ao voltar para a tab default", () => {
		const params = new URLSearchParams("tab=estoque");
		expect(
			buildTabHref("/dashboard/tools/1", params, "visao-geral", "visao-geral")
		).toBe("/dashboard/tools/1");
	});

	it("seta o param para tab não-default", () => {
		const params = new URLSearchParams();
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?tab=estoque");
	});

	it("descarta o param variant ao trocar de tab", () => {
		const params = new URLSearchParams("tab=variantes&variant=v1");
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?tab=estoque");
	});

	it("preserva outros params", () => {
		const params = new URLSearchParams("q=abc");
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?q=abc&tab=estoque");
	});
});
