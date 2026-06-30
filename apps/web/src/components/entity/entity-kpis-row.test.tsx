import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntityKpisRow } from "./entity-kpis-row";

describe("EntityKpisRow", () => {
	it("renderiza um <a> quando o item tem href", () => {
		const html = renderToStaticMarkup(
			<EntityKpisRow
				items={[{ label: "Alcance", value: 3, href: "/x?tab=tools" }]}
			/>
		);
		expect(html).toContain("<a");
		expect(html).toContain('href="/x?tab=tools"');
	});

	it("renderiza um <button> (não <a>) quando o item tem switchTab", () => {
		const html = renderToStaticMarkup(
			<EntityKpisRow
				items={[{ label: "Alcance", value: 3, switchTab: "tools" }]}
			/>
		);
		expect(html).toContain("<button");
		expect(html).not.toContain("<a");
	});

	it("switchTab tem precedência sobre href", () => {
		const html = renderToStaticMarkup(
			<EntityKpisRow
				items={[{ href: "/x", label: "Alcance", switchTab: "tools", value: 3 }]}
			/>
		);
		expect(html).toContain("<button");
		expect(html).not.toContain("<a");
	});
});
