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
