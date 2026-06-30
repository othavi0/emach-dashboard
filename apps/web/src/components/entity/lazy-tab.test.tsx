// apps/web/src/components/entity/lazy-tab.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyTabView } from "./lazy-tab";

const noop = () => undefined;

describe("LazyTabView", () => {
	it("mostra o skeleton enquanto carrega", () => {
		const html = renderToStaticMarkup(
			<LazyTabView data={null} onRetry={noop} status="loading">
				{(d: string) => <span>{d}</span>}
			</LazyTabView>
		);
		expect(html).toContain("animate-pulse");
	});

	it("mostra alerta de erro com botão de retry", () => {
		const html = renderToStaticMarkup(
			<LazyTabView data={null} onRetry={noop} status="error">
				{(d: string) => <span>{d}</span>}
			</LazyTabView>
		);
		expect(html).toContain("Tentar novamente");
	});

	it("renderiza os children com os dados quando ready", () => {
		const html = renderToStaticMarkup(
			<LazyTabView data="OK" onRetry={noop} status="ready">
				{(d: string) => <span>{d}</span>}
			</LazyTabView>
		);
		expect(html).toContain("<span>OK</span>");
	});
});
