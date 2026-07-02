/**
 * Resolve a tab ativa a partir da query string real do browser, clampada
 * contra a lista de tabs conhecidas — valor ausente ou desconhecido cai no
 * default. A URL é a fonte de verdade (o initialTab do server pode vir de um
 * payload RSC restaurado de outra entry de history após back/forward).
 */
export function resolveTabFromSearch(
	search: string,
	knownTabs: readonly string[],
	defaultValue: string,
	paramName = "tab"
): string {
	const raw = new URLSearchParams(search).get(paramName);
	return raw && knownTabs.includes(raw) ? raw : defaultValue;
}

/**
 * Clamp server-side do `?tab=` contra as tabs realmente montadas — derivado
 * do array (não de Set literal) para não driftar quando uma tab condicional
 * entra/sai (ex: "reembolso" em orders, "permissoes" em users).
 */
export function clampInitialTab(
	raw: string | undefined,
	tabs: readonly { value: string }[],
	defaultValue: string
): string {
	return raw && tabs.some((t) => t.value === raw) ? raw : defaultValue;
}

export function buildTabHref(
	pathname: string,
	params: URLSearchParams,
	tab: string,
	defaultValue: string,
	paramName = "tab",
	clearParams: string[] = []
): string {
	const sp = new URLSearchParams(params);
	for (const p of clearParams) {
		sp.delete(p);
	}
	if (tab === defaultValue) {
		sp.delete(paramName);
	} else {
		sp.set(paramName, tab);
	}
	const qs = sp.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}
