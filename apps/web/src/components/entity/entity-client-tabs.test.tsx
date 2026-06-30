// apps/web/src/components/entity/entity-client-tabs.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	usePathname: () => "/dashboard/x/1",
	useSearchParams: () => new URLSearchParams(),
}));

import { EntityClientTabs } from "./entity-client-tabs";

describe("EntityClientTabs", () => {
	const tabs = [
		{ value: "a", label: "Aba A", content: <p>conteudo-a</p> },
		{ value: "b", label: "Aba B", content: <p>conteudo-b</p>, lazy: true },
	];

	it("renderiza o header e os rótulos das tabs", () => {
		const html = renderToStaticMarkup(
			<EntityClientTabs
				defaultValue="a"
				header={<header>HEADER</header>}
				initialTab="a"
				tabs={tabs}
			/>
		);
		expect(html).toContain("HEADER");
		expect(html).toContain("Aba A");
		expect(html).toContain("Aba B");
	});

	it("não monta o conteúdo de uma tab lazy não-ativada", () => {
		const html = renderToStaticMarkup(
			<EntityClientTabs
				defaultValue="a"
				header={<header>HEADER</header>}
				initialTab="a"
				tabs={tabs}
			/>
		);
		expect(html).toContain("conteudo-a");
		expect(html).not.toContain("conteudo-b");
	});
});
