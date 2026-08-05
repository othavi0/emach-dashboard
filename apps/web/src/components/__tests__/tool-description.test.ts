import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolDescription } from "../tool-description";

function render(markdown: string | null): string {
	return renderToStaticMarkup(createElement(ToolDescription, { markdown }));
}

describe("ToolDescription", () => {
	it("preserva quebra de linha simples como <br>", () => {
		expect(render("linha um\nlinha dois")).toContain("<br");
	});

	it("renderiza lista com marcador visível", () => {
		const html = render("- item um\n- item dois");
		expect(html).toContain("<ul");
		expect(html).toContain("list-disc");
	});

	it("renderiza lista numerada com marcador", () => {
		const html = render("1. um\n2. dois");
		expect(html).toContain("<ol");
		expect(html).toContain("list-decimal");
	});

	it("renderiza negrito como strong", () => {
		expect(render("**importante**")).toContain("<strong>importante</strong>");
	});

	it("não contém classes prose mortas", () => {
		expect(render("texto")).not.toContain("prose");
	});

	it("markdown vazio/null mostra placeholder", () => {
		expect(render(null)).toContain("Sem descrição.");
		expect(render("   ")).toContain("Sem descrição.");
	});
});
