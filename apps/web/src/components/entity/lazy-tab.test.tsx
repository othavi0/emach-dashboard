// apps/web/src/components/entity/lazy-tab.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyTabView, useLazyTabReload } from "./lazy-tab";

const noop = () => undefined;

function ReloadCaller() {
	const reloadTab = useLazyTabReload();
	reloadTab();
	return <span>ok</span>;
}

describe("useLazyTabReload", () => {
	it("é um no-op quando usado fora do provider", () => {
		const html = renderToStaticMarkup(<ReloadCaller />);
		expect(html).toContain("ok");
	});
});

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
